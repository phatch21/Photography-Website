const express = require("express");
const session = require('express-session');
const bcrypt = require('bcrypt');
let app = express();
let path = require("path");
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));

// Serve static files from "public" folder
app.use(express.static(path.join(__dirname, "public")));

// Middleware for sessions
app.use(session({
    secret: 'supersecretkey', // Change to a secure secret key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Use `true` for HTTPS
}));

// Middleware to check if a user is logged in
function isAuthenticated(req, res, next) {
    if (req.session.isLoggedIn) {
        return next(); // User is logged in, proceed to the next middleware or route
    }
    res.redirect('/login'); // Redirect to login page
}

const knex = require("knex")({
    client: "pg", // Define the database client (PostgreSQL in this case).
    connection: { // Database connection details.
        host: process.env.RDS_HOSTNAME || 'localhost',//"awseb-e-vfbtv3p32z-stack-awsebrdsdatabase-jjafz3q7a3js.cv2g6ywg6824.us-east-1.rds.amazonaws.com", 
        user: process.env.RDS_USERNAME || "postgres", // PostgreSQL user with access to the database.
        password: process.env.RDS_PASSWORD || 'matt3j145367',//"supersecretpassword", // Password for the PostgreSQL user.
        database: process.env.RDS_DB_NAME || "ebdb", // Database name.
        port: process.env.RDS_PORT || 5432, // Default port for PostgreSQL.
        ssl: process.env.DB_SSL ? {rejectUnauthorized : false} : false
    }
});

// Home route
app.get("/", (req, res) => {
    res.render("index");
});

app.post("/", (req, res) => {
    const defaultuser = 'blah';
    const defaultpassword = 'blah';
    const username = req.body.username;
    const password = req.body.password;

    // Fetch the admin user from the database

    if (password == defaultpassword && username == defaultuser) {
        // Use bcrypt.compare() to check the password
        const isPasswordMatch = bcrypt.compare(password, admin.password);
        
        if (isPasswordMatch) {
            // Password matches, log in the user
            req.session.isLoggedIn = true;

            // Store the admin's ID and first name in the session for later use
            req.session.admin = {
                admin_id: admin.username,
            };

            // Redirect to the admin page
            res.render('admin');
        } else {
            // Password doesn't match
            res.status(401).send('Invalid username or password');
        }
    }
});

app.get('/admin', isAuthenticated, (req, res) => {
    res.render('admin')
})
 
app.get('/maintainAdmin', isAuthenticated, (req, res) => {
    knex('Admin')
        .select(
            'id',
            'UserName'
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
})
 
app.post('/addAdmin', isAuthenticated, async (req, res) => {
    try {
        const hashedPassword = await hashPassword(req.body.password); // Hash the password
        const username = req.body.username;
        // Insert new admin into the database
        await knex("Admin").insert({
            UserName: username,
            Password: hashedPassword // Store the hashed password
        });
        res.redirect('maintainAdmin')
 
    } catch (err) {
        console.error('Database Error:', err);
        res.status(500).json({ error: 'Failed to insert admin into database.' });
    }
});
 
app.post('/deleteAdmin/:id', (req, res) => {
    const id = req.params.id
    knex('Admin')
            .where('id', id)
            .del() // Deletes the record with the specified ID
            .then(() => {
            res.redirect('/maintainAdmin'); // Redirect to the maintainAdmin list after deletion
        }).catch(error => {
            console.error('Error deleting Admin:', error);
            res.status(500).send('Internal Server Error');
    });
});
 
//get info from databse so it shows up when edit is clicked
app.get('/editAdmin/:id', isAuthenticated, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        return res.status(400).send('Invalid admin_id');
    }
    knex('Admin')
        .where('id', id)
        .first()
        .then(admin => {
            if (!admin) {
                return res.status(404).send('Admin not found');
            }
            res.render('editAdmin', { admin });
        })
        .catch(error => {
            console.error('Error querying database:', error);
            res.status(500).send('Internal Server Error');
        });
});
 
 
//Replaced info in admin table w/edits
app.post('/editAdmin/:id', (req, res) => {
    const id = req.params.id;
    const username = req.body.username;
    const password = hashPassword(req.body.password);
    knex('Admin')
        .where('id', id)
        .first()
        .update({
        UserName: username,
        Password: password,
        })
        .then(() => {
        res.redirect('/maintainAdmin'); // Redirect to the list of Admin after saving
        })
        .catch(error => {
        console.error('Error updating Character:', error);
        res.status(500).send('Internal Server Error');
    });
})

// Start the server
app.listen(port, () => console.log(`Portfolio website is listening on port ${port}`));
