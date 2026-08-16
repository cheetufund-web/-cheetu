
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

When using the development-only OTP flow, `OAUTH_SERVER_URL` is optional. The server logs that Manus OAuth is disabled and uses local email OTP instead. The browser no longer loads analytics unless an explicit analytics script is configured, so missing analytics variables do not create malformed requests.

### Windows `.env` checklist

For a local Windows run, create a `.env` file in the project root with the following required server values. Replace placeholders with your own values and never commit this file:

```env
NODE_ENV=development
JWT_SECRET=use-a-long-random-local-secret
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
OWNER_OPEN_ID=local-demo-owner
OWNER_NAME=Admin
```

`OAUTH_SERVER_URL`, `VITE_APP_ID`, SMTP variables, and analytics variables are optional for the local dummy OTP flow. If `OAUTH_SERVER_URL` is omitted, the server uses local email OTP and does not attempt Manus OAuth. Use `demo@cheetu.local` and the displayed demo code `123456` during development.
