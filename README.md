<div align="center">
   <img src="https://github.com/WebKide/gitawisdom/blob/main/assets/images/gitawisdom.svg" alt="project logo" width="40%" />
</div>

------

<div align="center">
   <img src="https://img.shields.io/badge/Project%20by-WebKide-black.svg?style=popout&logo=github&logoColor=white" alt="Author" />
   <img src="https://img.shields.io/github/commit-activity/t/WebKide/gitawisdom?color=%23f5a623" alt="Version" /> 
</div>

<div align="center">
   <img src="https://img.shields.io/badge/Made%20with-JavaScript-blue.svg?style=popout&logo=javascript&logoColor=yellow" alt="JavaScript" />
   <img src="https://img.shields.io/badge/Library-html2canvas-yellow?style=popout" alt="html2canvas" />
   <img src="https://img.shields.io/badge/Data-LocalJSON-%234ea94b.svg?style=popout&logo=git&logoColor=white" alt="Local JSON" />  
</div>

<div align="center">
   <img src="http://forthebadge.com/images/badges/built-with-love.svg?style=for-the-badge" alt="built with love" />
</div>

<div align="center">
   <h2>「✦ Wisdom Oracle ✦」</h2>
</div>

Find instant wisdom, clarity, and emotional strength for everyday parenting challenges. Explore timeless teachings from the **Bhagavad Gītā** and **I Ching**, rendered in a clean, dark-themed web app that works fully offline.

![Example]()

## 🗃️ Features v1.0.7

- **Random Oracle Readings** - Get a verse from the Bhagavad Gītā or a hexagram from the I Ching at random.
- **Lookup by Chapter or Number** - Search specific chapters and verse numbers or hexagram numbers.
- **Share Text or Image** - Share verses as plain text or as a ready-made social media-friendly PNG.
- **Fully Offline** - Works completely offline after the initial load.
- **Auto-Updates** - Service worker fetches new content and improvements automatically.
- **Ad-Free** - No data collection, no accounts required, free to use.

## 📦 Installation

### Android (Chrome):

1. Open [WisdomOracle](https://webkide.github.io/gitawisdom) in **Chrome Browser**.
2. Tap the three-dot menu (⋮) top right.
3. Tap **"Add to Home screen"**.
4. Confirm the name and tap **Add**.
5. The app icon appears on your home screen and works offline.

### iPhone (Safari):

1. Open [WisdomOracle](https://webkide.github.io/gitawisdom) in **Safari**.
2. Tap the **Share button** (the box with an arrow pointing up).
3. Scroll down and tap **"Add to Home Screen"**.
4. Confirm the name and tap **Add**.
5. The app icon appears on your home screen and works offline.

---

## 📖 Usage

- Explore random verses or hexagrams.
- Lookup specific chapters/hexagrams.
- Tap **Share** to copy text or generate a social media-ready PNG.
- Works offline after initial load, even in airplane mode.

### 🔰 Behavior

- All content is rendered locally from JSON files.
- Gītā verses are displayed with proper formatting for easy readability.
- PNG share cards are generated with the verse text, title, and background image.
- Service worker ensures offline functionality and background updates.

## 🌟 FOSS and Privacy

**Wisdom Oracle** is a free and open-source project (FOSS). This means all the code and content are publicly available, so anyone can inspect, modify, or contribute. No accounts or subscriptions are required to use the app, and it does not collect, track, or share any personal data.

Your privacy matters. The idea that **“if you have nothing to hide, you have nothing to fear”** is often used as a slogan to justify surveillance. In reality, it is a form of propaganda designed to strip people of their personal liberties and freedoms. True privacy and autonomy are fundamental rights, not privileges.

By keeping **Wisdom Oracle** offline-capable and free from tracking, the app gives you the freedom to explore wisdom without surrendering your personal information.

## 🛠️ Support

For issues or feature requests, please open an issue on [GitHub](https://github.com/WebKide/gitawisdom/tree/main).

---

### ✨ Technical Details

- **Developer:** [WebKide](https://webkide.github.io/gitawisdom/)
- **Libraries used:** [`html2canvas.min.js`](https://html2canvas.hertzen.com/)
- **Data source:** Bhagavad Gītā As It Is (1972 Unabridged Edition, Macmillan) and I Ching JSON files
- **Repository:** [GitHub: WebKide/gitawisdom](https://github.com/WebKide/gitawisdom/tree/main)
- **Live URL:** [https://webkide.github.io/gitawisdom](https://webkide.github.io/gitawisdom)


### 🤔 TODOs

- [x] Convert all 18 chapters of Bhagavad Gītā to JSON
- [x] Convert iChing hexagrams to JSON
- [x] Port code from Python (discord.py) to JavaScript
- [x] Dark mode, responsive design for Web and Mobile
- [x] PWA splash screen, next loads app screen
- [x] PWA support, app can be installed and runs totally offline on iOS/Android
- [ ] Bookmark verse/hexagram, browse bookmarks from main screen
- [x] Share verse, generates PNG 1080px * 1350 px (4:5 ratio) compatible with socail media
- [ ] Verse Search function to search keyword and get clickable link to verse