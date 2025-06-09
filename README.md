# Google Scholar Self-Citation Checker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This lightweight Chrome extension looks up an author's DBLP profile and displays the percentage of open citations that are self‑citations.

![Screenshot of Extension](Images/Screenshot.png)

## Features

| Feature | Description |
|---------|-------------|
| 🔄 **Self-citation stats** | Shows the proportion of citations where the author cites themselves, using DBLP's SPARQL endpoint. |
| 💾 **Caching** | Statistics are cached per author and can be refreshed using the provided button. |

## Quick Install

1.  **Download or Clone:**
    *   **Option A (Download ZIP):** Download the latest release or click on the green "Code" button, then "Download ZIP". Extract the ZIP file.
    *   **Option B (Clone with Git):**
        ```bash
        git clone https://github.com/naveedanwarbhatti/Google-Scholar-Conference-Ranker.git
        ```

2.  **Load the Extension in Chrome:**
    *   Open Google Chrome.
    *   Navigate to `chrome://extensions`.
    *   Enable **"Developer mode"**.
    *   Click **"Load unpacked"** and select the extension folder.

3.  **Verify:** Navigate to a Google Scholar profile page. The self-citation panel should appear at the top of the profile.

## License

This project is licensed under the MIT License.
