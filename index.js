
global.whatsappInitialized = false;
require('dotenv').config();
const express = require("express");

const session = require('express-session');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const hbs = require('express-handlebars');
const db = require('./config/connection');
const fileUpload = require('express-fileupload');
const { initSocket } = require('./services/socket_server');
const http = require('http');
const cors = require('cors');
const PORT = process.env.PORT || 3000;
const compression = require('compression');
const functions = require('firebase-functions');
// const { createWriteStream } = require('fs');
const app = express();
const server = http.createServer(app);
const fs = require('fs');
const cron = require('node-cron');
const https = require('https');
const whatsappService = require('./services/whatsapp_nonapi_service');


// https.createServer({
//   key: fs.readFileSync('key.pem'),
//   cert: fs.readFileSync('cert.pem')
// }, app).listen(PORT, () => {
//   console.log(`HTTPS server running on port ${PORT}`);
// });
// Database connections
db.connect(err => {
  if (err) console.log("Mongo connection error: " + err);
  else console.log("Mongo connected");
});
// Middleware setup
app.use(cors());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Allow any domain (not secure for production)
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
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


initSocket(server);

// Route imports
const routes = [
  { path: '/officer', route: require("./routes/officers/officers_router") },
  { path: '/config', route: require("./routes/officers/configs_router") },
  // { path: '/project', route: require("./routes/officers/project_router") },
  { path: '/product', route: require("./routes/officers/product_router") },
  { path: '/booking', route: require("./routes/officers/booking_router") },
  { path: '/lead', route: require("./routes/officers/lead_router") },
  {path: '/campaign', route: require("./routes/officers/campaign_router") },
  {path: '/customer', route: require("./routes/officers/customer_interaction_router") },
  // {path: '/customer', route: require("./routes/officers/customer_router") },
  // {path: '/customer/register', route: require("./routes/officers/customer_registration_router") },
  {path: '/announcement', route: require("./routes/officers/announcement_router") },
  { path: '/event', route: require("./routes/officers/event_router") },
  // {path: '/cre', route: require("./routes/officers/cre_router") },
  { path: '/', route: require("./routes/webiste/website") },
  { path: '/whatsapp_nonapi', route: require("./routes/officers/whatsapp_nonapi_router") },
  { path: '/whatsapp', route: require("./routes/officers/whatsapp_data_router") },
  { path: '/email', route: require("./routes/officers/email_tracking_router") },
   { path: '/whatsapp_api', route: require("./routes/officers/whatsapp_api_router") },
];

whatsappService.initialize().catch(err => {
  console.error('Failed to initialize WhatsApp:', err);
});

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


exports.api = functions.https.onRequest(app);

// Start the server:
server.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port http://localhost:${PORT}`));

// server.listen(PORT, "0.0.0.0", () => {
//   console.log(`Server listening on port ${PORT}`);
  
//   // CRITICAL: Only initialize once
//   if (!global.whatsappInitialized) {
//     global.whatsappInitialized = true;
    
//     // Delay initialization to let server settle
//     setTimeout(() => {
//       whatsappService.initialize().catch(err => {
//         console.error('Failed to initialize WhatsApp:', err);
//       });
//     }, 3000);
//   }
// });
// Cron job for token refresh



//https://dev-sejaya-admin.web.app/auth/reset-password?email=sibin.james@gojo.co&code=519778
// // ACTIVE ,INACTIVE,DELETED,BLOCKED,UNASSIGNED

//  HOT, DEAD, UNASSIGNED,FOLLOWUP, FUTURE


// thinsg to do
/*** 
 // scoring or rating for customer based on they can add raing inntraction and booking , on time payment , no of booking
 * //each officers lead status in frist page for officer 
 call reshedule not updating immediately 
 billing page need registartion for non existing client 
 will add tag to leads that they can add different tag to filter leads in future
 delete product and lead

 booking doc not updating immediately after creting  need to check


 task sheudled for booking 
 
 need to convert unknown( got a call ) lead to lead with officer 
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
