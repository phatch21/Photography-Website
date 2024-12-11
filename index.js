const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

// AWS SDK v3
const { S3Client, PutObjectCommand, ListObjectsCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const app = express();
const port = process.env.PORT || 3000;

// Initialize AWS S3 Client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Configure Multer
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Configure Express
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Configure Sessions
app.use(
  session({
    secret: "supersecretkey",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

// Connect to the db
const knex = require("knex")({
  client: "pg", // Define the database client (PostgreSQL in this case).
  connection: { // Database connection details.
      host: process.env.RDS_HOSTNAME || "awseb-e-xqydbh7xwn-stack-awsebrdsdatabase-dwl8zqlcxpnq.cv2g6ywg6824.us-east-1.rds.amazonaws.com", 
      user: process.env.RDS_USERNAME || "postgres", // PostgreSQL user with access to the database.
      password: process.env.RDS_PASSWORD || "supersecretpassword", // Password for the PostgreSQL user.
      database: process.env.RDS_DB_NAME || "ebdb", // Database name.
      port: process.env.RDS_PORT || 5432, // Default port for PostgreSQL.
      ssl: process.env.DB_SSL ? {rejectUnauthorized : false} : false
  }
});

// Middleware to check if a user is logged in
function isAuthenticated(req, res, next) {
    if (req.session.isLoggedIn) {
        return next(); // User is logged in, proceed to the next middleware or route
    }
    res.redirect('/login'); // Redirect to login page
}

// Hashing a password
async function hashPassword(password) {
  const saltRounds = 10; // Number of iterations (adjust based on your system's capacity)
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  return hashedPassword;
}

// Verifying a password
// async function verifyPassword(password, hashedPassword) {
//   const match = await bcrypt.compare(password, hashedPassword);
//   return match; // Returns true if passwords match
// }

// Home Route
app.get("/", (req, res) => {
  res.render("index");
});

// Login route
app.get('/login', (req, res) => {
  req.session.isLoggedIn = false;
  res.render('login');
});

// Handling a login POST request
app.post('/login', async (req, res) => {
  //const { token } = req.body; // The TOTP token entered by the user
  const username = req.body.username;
  const password = hashPassword(req.body.password); // Plain-text password from the user

  try {
      // Fetch the admin user from the database
      const admin = await knex.select()
          .from('admin')
          .where('username', username)
          .first();

      if (admin) {
          // Use bcrypt.compare() to check the password
          const isPasswordMatch = await bcrypt.compare(req.body.password, admin.password); // Fix for login

         
          if (isPasswordMatch) {
              // Password matches, log in the user
              req.session.isLoggedIn = true;
              res.redirect('/admin');
          } else {
              // Password doesn't match
              res.status(401).send('Invalid username or password');
          }
      } else {
          // Username not found
          res.status(401).send('Invalid username or password');
      }
  } catch (err) {
      console.error('Error during login:', err);
      res.status(500).send('An error occurred while processing your request');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
      if (err) {
          return res.status(500).send('Failed to log out');
      }
      // Redirect to the login page or home page after logging out
      res.redirect('/'); // Adjust this as needed
  });
});

// Route to Render Upload Form
app.get("/upload", isAuthenticated,async (req, res) => {
    try {
      // Fetch data from PostgreSQL
      const albums = await knex("album").select("albumID", "albumName");
      const categories = await knex("category").select("categoryID", "catName");
  
      // Render the form with dynamic data
      res.render("upload", { albums, categories });
    } catch (error) {
      console.error("Error fetching data:", error);
      res.status(500).send("Error loading form.");
    }
});  

// Upload Route
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).send("No file uploaded.");

    const key = `uploads/${Date.now()}_${file.originalname}`;

    // Upload File to S3
    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    await s3.send(new PutObjectCommand(uploadParams));

    // Save file metadata in PostgreSQL
    await knex("photos").insert({
      photoName: file.originalname,
      filePath: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
      description: req.body.description,
      categoryID: req.body.categoryID,
      albumID: req.body.albumID,
      s3_key: key,
      dateOfCapture: new Date(),
    });

    res.render('admin');
  } catch (error) {
    console.error("File upload error:", error);
    res.status(500).send("File upload failed.");
  }
});

app.get("/admin", isAuthenticated, (req, res) => {
    res.render("admin");
});

app.get('/maintainAdmin', isAuthenticated, (req, res) => {
    knex('admin')
        .select(
            'username'
        )
        //returns all the records as an ARRAY of ROWS
        .then(admin => {
            // Render the index.ejs template and pass the data
            res.render('maintainAdmin', { admin });
        })
        .catch(error => {
        console.error('Error querying database:', error);
        res.status(500).send('Internal Server Error');
        });
});
 
app.get('/addAdmin', isAuthenticated, async (req, res) => {
    res.render('addAdmin');
});
 
app.post('/addAdmin', async (req, res) => {
    try {
        const password = await hashPassword(req.body.password); // Fix for adding admin
        const username = req.body.username;
        // Insert new admin into the database
        await knex("admin").insert({
            username: username,
            password: password
        });
        res.redirect('maintainAdmin')
 
    } catch (err) {
        console.error('Database Error:', err);
        res.status(500).json({ error: 'Failed to insert admin into database.' });
    }
});
 
app.post('/deleteAdmin/:username', (req, res) => {
    const username = req.params.username
    knex('admin')
            .where('username', username)
            .del() // Deletes the record with the specified ID
            .then(() => {
            res.redirect('/maintainAdmin'); // Redirect to the maintainAdmin list after deletion
        }).catch(error => {
            console.error('Error deleting Admin:', error);
            res.status(500).send('Internal Server Error');
    });
});
 
//get info from databse so it shows up when edit is clicked
app.get('/editAdmin/:username', isAuthenticated, async (req, res) => {
    const username = req.params.username;

    try {
        const admin = await knex('admin')
            .where('username', username)
            .first();

        if (!admin) {
            return res.status(404).send('Admin not found');
        }

        res.render('editAdmin', { admin });
    } catch (error) {
        console.error('Error querying database:', error);
        res.status(500).send('Internal Server Error');
    }
});

 
//Replaced info in admin table w/edits
app.post('/editAdmin/:username', async (req, res) => {
    const oldUsername = req.params.username;
    const { username, password } = req.body;

    try {
        // Hash the new password
        const hashedPassword = password;

        // Update the database
        await knex('admin')
            .where('username', oldUsername)
            .update({
                username,
                password: hashedPassword,
            });

        res.redirect('/maintainAdmin');
    } catch (error) {
        console.error('Error updating admin:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/maintainImages', isAuthenticated, (req, res) => {
    knex('photos')
        .select()
        .then(photo => {
            // Render the index.ejs template and pass the data
            res.render('maintainImages', { photo });
        })
        .catch(error => {
        console.error('Error querying database:', error);
        res.status(500).send('Internal Server Error');
        });
});

// Delete Route
app.post('/deleteImage/:photoID', async (req, res) => {
    const photoID = req.params.photoID

    const photo = await knex("photos")
            .where({ photoID: photoID })
            .first();

    if (!photo) {
        return res.status(404).send("Photo not found.");
    }

     // Delete the file from S3
     const deleteParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: photo.s3_key
    };

    await s3.send(new DeleteObjectCommand(deleteParams));

    await knex('photos')
            .where('photoID', photoID)
            .del() // Deletes the record with the specified ID
            .then(() => {
            res.redirect('/maintainImages'); // Redirect to the maintainAdmin list after deletion
        }).catch(error => {
            console.error('Error deleting images:', error);
            res.status(500).send('Internal Server Error');
    });
});

//get info from databse so it shows up when edit is clicked
app.get('/editImage/:photoID', isAuthenticated, async (req, res) => {
    const photoID = req.params.photoID;

    try {
        // Fetch photos from the database
        const albums = await knex("album").select("albumID", "albumName");
      const categories = await knex("category").select("categoryID", "catName");
  
      // Fetch photos from the database
      const photo = await knex("photos")
        .select()
        .leftJoin("album", "photos.albumID", "album.albumID")
        .leftJoin("category", "photos.categoryID", "category.categoryID")
        .where("photoID", photoID);
  
      // Render the gallery with the dynamic data
      res.render("editImage", { albums, categories, photo });

    } catch (error) {
        console.error('Error querying database:', error);
        res.status(500).send('Internal Server Error');
    }
});

//Replaced info in admin table w/edits
app.post('/editImage/:photoID', async (req, res) => {
    const photoID = req.params.photoID;
    const photoName = req.body.photoName;
    const description = req.body.description;
    const categoryID = parseInt(req.body.categoryID);
    const albumID = parseInt(req.body.albumID);

    try {

        // Update the database
        await knex('photos')
            .where('photoID', photoID)
            .update({
                photoName: photoName,
                description: description,
                categoryID: categoryID,
                albumID: albumID
            });

        res.redirect('/maintainImages');
    } catch (error) {
        console.error('Error updating images:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route to Render the Gallery
app.get("/gallery", async (req, res) => {
    try {
      // Fetch albums and categories from the database
      const albums = await knex("album").select("albumID", "albumName");
      const categories = await knex("category").select("categoryID", "catName");
  
      // Fetch photos from the database
      const photos = await knex("photos")
        .select()
        .leftJoin("album", "photos.albumID", "album.albumID")
        .leftJoin("category", "photos.categoryID", "category.categoryID");
  
      // Render the gallery with the dynamic data
      res.render("gallery", { albums, categories, photos });
    } catch (error) {
      console.error("Error fetching data:", error);
      res.status(500).send("Error loading gallery.");
    }
});

// Start the Server
app.listen(port, () =>
  console.log(`Portfolio website running on http://localhost:${port}`)
);