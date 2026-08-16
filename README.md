
## Cheetu local authentication and Windows setup

The local build uses a development-only email OTP flow so it does not require an SMTP subscription. Start the app with `pnpm dev`, open the printed URL, use `demo@cheetu.local`, click **Generate OTP**, and enter `123456`. The demo OTP is intentionally shown only when `NODE_ENV=development`.

On Windows PowerShell, install Node.js 20 or newer, enable pnpm with `corepack enable`, then run `pnpm install` and `pnpm dev`. The project uses `cross-env`, so the `dev` and `start` scripts work on Windows, macOS, and Linux without changing environment-variable syntax.

For production email delivery, set these server-side variables and remove the demo-only deployment mode:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
OTP_FROM=Cheetu Chits <no-reply@example.com>
```

SMTP is optional during local development. Never expose `SMTP_PASSWORD`, `MONGODB_URI`, or any other server secret in client code or committed `.env` files.

When using the development-only OTP flow, the server uses local email OTP. The browser no longer loads analytics unless an explicit analytics script is configured, so missing analytics variables do not create malformed requests.

### Windows `.env` checklist

For a local Windows run, create a `.env` file in the project root with the following required server values. Replace placeholders with your own values and never commit this file:

```env
NODE_ENV=development
JWT_SECRET=use-a-long-random-local-secret
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
OWNER_OPEN_ID=local-demo-owner
OWNER_NAME=Admin
```

SMTP variables and analytics variables are optional for the local dummy OTP flow. Use the configured administrator email and the displayed demo code `123456` during development. Production uses Gmail SMTP and a randomly generated OTP.

### Vercel deployment

Cheetu includes a Vercel-compatible API entrypoint in `api/index.ts` and `vercel.json`. The Vercel build creates the browser bundle in `dist/public` and routes `/api/*` requests to the tRPC serverless function. The project must be deployed from the Git branch connected to the Vercel project; do not upload `.env` files or commit secrets.

In Vercel, open **Project → Settings → Environment Variables** and add the following variables for the **Production** environment:

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/kukkal_seat_chits?retryWrites=true&w=majority&appName=CHEETU
JWT_SECRET=use-a-long-random-production-secret
OWNER_OPEN_ID=cheetu-owner
OWNER_NAME=Cheetu Administrator
DEMO_OTP_EMAIL=cheetufund@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=cheetufund@gmail.com
SMTP_PASSWORD=your-gmail-app-password
OTP_FROM=Cheetu Chits <cheetufund@gmail.com>
VITE_APP_TITLE=Cheetu Chits
```

After saving environment variables, push the code to the Vercel-connected production branch or select **Redeploy** for the latest commit. A successful deployment should serve the application at `/` and should not show a Vercel `404 NOT_FOUND` page. The browser API smoke test is to open `/api/trpc/auth.me`; an unauthenticated response is acceptable, while a Vercel 404 indicates that the serverless route is not connected.

For a real production OTP test, open the deployed root page, enter `cheetufund@gmail.com`, choose **Generate OTP**, confirm that Gmail receives the message, enter the received code, and verify that the Cheetu dashboard loads. Production mode does not use the local `123456` demo code. MongoDB Atlas must allow connections from the deployed application, and all database, JWT, and SMTP values must remain in Vercel’s encrypted environment settings.

### Credential rotation before production redeployment

If a MongoDB password, Gmail App Password, or JWT secret has been pasted into chat, an issue tracker, a screenshot, or a public repository, treat it as exposed. Before production redeployment, change the MongoDB database-user password in Atlas, revoke and recreate the Gmail App Password in Google Account security settings, and generate a new `JWT_SECRET`. Update the replacement values only in Vercel’s encrypted Production and Preview environment settings, then redeploy. Never commit these values to GitHub or include them in client-side `VITE_` variables.
