
const express = require("express");
const https = require('https');
const session = require('express-session');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const hbs = require('express-handlebars');
const db = require('./config/connection');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const cron = require('node-cron');
const http = require('http');
const cors = require('cors');
const PORT = process.env.PORT || 3000;
// const functions = require("firebase-functions");
const compression = require('compression');

const { createWriteStream } = require('fs');
const app = express();
const server = http.createServer(app);


https.createServer({
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
}, app).listen(PORT, () => {
  console.log(`HTTPS server running on port ${PORT}`);
});
// Database connections
db.connect(err => {
  if (err) console.log("Mongo connection error: " + err);
  else console.log("Mongo connected");
});
// Middleware setup
app.use(cors());
app.use(express.static(path.join(__dirname, 'assets')));
app.use(bodyParser.json({ limit: '25mb' }));
app.use(bodyParser.urlencoded({ limit: '25mb', extended: true }));


// app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({
  secret: "Aikara",
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 90000 }
}));
app.use(compression());
app.use(fileUpload({ safeFileNames: true, preserveExtension: true, }));
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// Handlebars setup
app.engine('hbs', hbs.engine({
  extname: 'hbs',
  defaultLayout: 'layout',
  layoutsDir: path.join(__dirname, 'views/layout/'),
  partialsDir: [
    path.join(__dirname, 'views/partials'),
    path.join(__dirname, 'views/website/partials')
  ],
}));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// Route imports
const routes = [
  { path: '/officer', route: require("./routes/officers/officers_router") },
  { path: '/config', route: require("./routes/officers/configs_router") },
  { path: '/project', route: require("./routes/officers/project_router") },
  { path: '/lead', route: require("./routes/officers/lead_router") },
  {path: '/campaign', route: require("./routes/officers/campaign_router") },
  {path: '/customer', route: require("./routes/officers/customer_interaction_router") },
  {path: '/customer', route: require("./routes/officers/customer_router") },
  {path: '/customer/register', route: require("./routes/officers/customer_registration_router") },
  {path: '/announcement', route: require("./routes/officers/announcement_router") },
  {path: '/cre', route: require("./routes/officers/cre_router") },
  { path: '/', route: require("./routes/webiste/website") }
];

// Use routes
routes.forEach(({ path, route }) => app.use(path, route));

// Handle unmatched routes (404)
app.use((req, res, next) => {
  res.status(404).json({ msg: "url not found error" });
});

// Terms and Conditions route
app.route("/termsAndConditions").get((req, res) => res.render("terms"));

// Error handling
app.use((req, res, next) => {
  res.status(404).render("error");
});


// exports.app = functions.https.onRequest(app);

// Start the server
// server.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port ${PORT}`));

// Cron job for token refresh



//https://dev-sejaya-admin.web.app/auth/reset-password?email=sibin.james@gojo.co&code=519778
// // ACTIVE ,INACTIVE,DELETED,BLOCKED,UNASSIGNED

//  HOT, DEAD, UNASSIGNED,FOLLOWUP, FUTURE


// thinsg to do
/*** 
 check dead lead while insert lead
 filter admin call history with department like now admin will see all officers call history without cre or recruiter filter
 *    ***/


 /***
  *  {          type: 'status_update',
                type: 'officer_assigned',
                type: 'call_event',
                type: 'client_restored'
                client_id: new ObjectId(data.client_id),
                officer_id: officerId,
                duration: data.duration || 0,
                next_schedule: data.next_schedule || null,
                client_status: data.client_status || '',
                comment: data.comment || '',
                call_type: data.call_type || '',
                call_status: data.call_status || '',
                created_at: new Date()
               
             


  */


