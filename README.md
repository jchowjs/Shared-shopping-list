# Family Shopping List

A simple shared shopping list for the family.

- Anyone can add an item, with an optional amount or note (e.g. "Eggs, 2 dozen").
- Each item shows who added it.
- Whoever buys an item taps the circle and it disappears from everyone's phone straight away. Tapped the wrong one? Press **Undo**.
- It can sit on your phone's home screen like an app.

## One-time setup (about 10 minutes)

The list needs somewhere online to keep the items so every phone sees the same list. We use **Firebase**, a free Google service. You only do this once.

### 1. Create a free Firebase project

1. Go to <https://console.firebase.google.com> and sign in with any Google account.
2. Click **Create a project** (or **Add project**). Call it something like `family-shopping`.
3. When it asks about Google Analytics, switch it **off**. You don't need it.
4. Click **Create project** and wait a moment.

### 2. Connect this app to Firebase

1. On your project's home page, click the **web** icon, which looks like `</>`.
2. Give it a nickname (e.g. `shopping-list`). Leave "Firebase Hosting" unticked. Click **Register app**.
3. Firebase shows a block of text containing `apiKey`, `authDomain`, `projectId` and so on. Keep that page open.
4. In this GitHub project, open the file **`config.js`**, click the pencil icon (Edit), and replace each `PASTE_HERE` with the matching value from Firebase. Click **Commit changes**.

   (These details are designed to be public, so it's fine that they're in this file.)

### 3. Turn on the storage and lock it down

1. In Firebase's left-hand menu, open **Build → Firestore Database** and click **Create database**.
2. Pick a location near you (e.g. Singapore) and choose **Start in production mode**.
3. When it's created, open the **Rules** tab. Delete everything in the box, paste in the full contents of the **`firestore.rules`** file from this project, and click **Publish**.

These rules mean nobody can see or change your list unless they have your family link.

### 4. Put the website online (free, with GitHub Pages)

1. In this GitHub project, go to **Settings → Pages**.
2. Under "Build and deployment", set **Source** to *Deploy from a branch*, then pick branch **main** and folder **/ (root)**. Click **Save**.
3. After a minute or two the page shows your website address, something like `https://jchowjs.github.io/Shared-shopping-list/`.

> On a free GitHub account, Pages only works if the project is **public**. That's fine: the code is public, but your list isn't. Only someone with your family link can see it.

### 5. Start your list and share it

1. Open your website address on your phone and tap **Start a new family list**.
2. Type your name.
3. At the bottom, open **Share this list with family**, tap **Copy**, and send the link to your family (e.g. on WhatsApp).
4. Each person opens the link and types their name once. That's it.

## Add it to your phone's home screen

Open **the family link** (not the plain website address), then:

- **iPhone (Safari):** tap the Share button (square with an arrow), then **Add to Home Screen**.
- **Android (Chrome):** tap the **⋮** menu, then **Add to Home screen** or **Install app**.

## Good to know

- **Keep the link within the family.** Anyone with it can add and tick items.
- **Changing your name:** tap your name in the top-right corner.
- **Poor signal in the shop?** The list keeps a copy on your phone, so you can still see it. Changes sync once you're back online.
- **Cost:** a family shopping list stays well inside Firebase's and GitHub's free allowances.

## What's in this project

| File | What it does |
| --- | --- |
| `index.html`, `style.css` | The page and how it looks |
| `app.js` | Adding, showing and ticking off items |
| `config.js` | Your Firebase details (step 2) |
| `firestore.rules` | Who's allowed to read and change the list (step 3) |
| `manifest.webmanifest`, `icons/` | The home-screen icon and name |
