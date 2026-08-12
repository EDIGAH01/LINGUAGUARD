// Root entry shim.
//
// The application server lives in server/index.js. Some hosts (and the
// package.json "main" field) resolve the entry point as ./index.js at the repo
// root and run `node index.js`. This shim makes that work by delegating to the
// real server, so the app boots identically whether it is started via
// `node index.js`, `npm start`, or the render.yaml startCommand
// (`node server/index.js`).
require("./server/index.js");
