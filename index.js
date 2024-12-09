const express = require("express");
const session = require('express-session');
const bcrypt = require('bcrypt');
let app = express();
let path = require("path");
const port = process.env.port || 3000;

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
    client: "pg",
    connection: {
        host: "localhost",
        user: "postgres",
        password: "matt3j145367",
        database: "IS403_A4",
        port: 5432
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

// Start the server
app.listen(port, () => console.log(`Portfolio website is listening on port ${port}`));
