const jwt = require("jsonwebtoken");
require('dotenv').config();

const config = {
  key: process.env.JWT_SECRET || "defaultSecretKey" // fallback if env not set
};

let checkToken = (req, res, next) => {
  let token = req.headers["authorization"];

  if (token && token.startsWith("Bearer ")) {
    token = token.substring(7); // remove 'Bearer '

    jwt.verify(token, config.key, (err, decoded) => {
      if (err) {
        return res.status(401).json({
          status: false,
          msg: "Token is invalid",
        });
      } else {
        req.decoded = decoded; // attach decoded token to request
        next();
      }
    });
  } else {
    // No token provided, skip validation
    next();
  }
};

module.exports = {
  checkToken
};



// const jwt = require("jsonwebtoken");
// require('dotenv').config();
// const config = {
//   key: process.env.JWT_SECRET
// };
// let checkToken = (req, res, next) => {
//   next(); // Temporarily allowing all requests, remove this line to enforce token checks
//   let token = req.headers["authorization"];
//   if (token!=null) {
//     token = token.substring(7);
//     jwt.verify(token, config.key, (err, decoded) => {
//       if (err) {
//         return res.status(500).json({
//           status: false,
//           msg: "token is invalid",
//         });
//       } else {
//         req.decoded = decoded;
//         next();
//       }
//     });
//   } else {
//     return res.status(500).json({
//       status: false,
//       msg: "Token is not provided",
//     });
//   }
// };

// module.exports = {
//   checkToken: checkToken,
//  };