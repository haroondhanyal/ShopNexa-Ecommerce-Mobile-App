# ShopNexa Mobile App

Expo / React Native app for ShopNexa.

## Run locally

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the backend API URL reachable from the device.
3. Start the app: `npm start`

Start the backend separately. For a local presentation, set `DEMO_CARD_PAYMENTS=true` in `backend/.env` while `NODE_ENV=development`.

## Offline card demo

This is a local simulation only. It never charges money and the card number or CVC is not sent to the backend or saved. Use test card `4242 4242 4242 4242`, any future expiry, CVC `123`, and a postal code. Use `4000 0000 0000 0002` to simulate a declined payment. Do not enter real card details.
