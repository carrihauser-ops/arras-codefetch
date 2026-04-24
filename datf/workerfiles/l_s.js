const puppeteer = require('puppeteer');

let browser = null;
let currentProxyUrl = null;
async function getBrowser(proxyUrl = null) {
  // If proxy has changed, close and recreate browser
  if (currentProxyUrl !== proxyUrl && browser) {
    await closeBrowser();
    browser = null;
    currentProxyUrl = null;
  }

  if (!browser) {
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions'
    ];

    // Add proxy if provided
    if (proxyUrl) {
      launchArgs.push(`--proxy-server=${proxyUrl}`);
      console.log(`[puppeteer] Launching browser with proxy: ${proxyUrl}`);
    } else {
      console.log(`[puppeteer] Launching browser without proxy`);
    }

    browser = await puppeteer.launch({
      headless: true,
      args: launchArgs
    });
    
    currentProxyUrl = proxyUrl;
  }
  return browser;
}

async function scrapeLinks(url, retries = 3, proxyUrl = null) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[puppeteer] Attempt ${attempt}/${retries} to scrape: ${url}${proxyUrl ? ' (with proxy)' : ''}`);
      
      const browser = await getBrowser(proxyUrl);
      const page = await browser.newPage();

      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      // Set timeout and navigate
      page.setDefaultNavigationTimeout(15000);
      page.setDefaultTimeout(15000);

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      } catch (e) {
        console.log('[puppeteer] Navigation timeout, continuing anyway...');
      }

      // Wait a bit for any dynamic content to load (compatible across puppeteer versions)
      await sleep(2000);

      // Extract all links from the page
      const links = await page.evaluate(() => {
        const allLinks = [];

        // Strategy 1: Get all <a> tags
        const aTags = document.querySelectorAll('a[href]');
        for (const a of aTags) {
          const href = a.getAttribute('href');
          if (href) allLinks.push(href);
        }

        // Strategy 2: Get all onclick handlers with URLs
        const onclickElements = document.querySelectorAll('[onclick*="arras"]');
        for (const el of onclickElements) {
          const onclick = el.getAttribute('onclick');
          if (onclick) {
            const urlMatches = onclick.match(/(https?:\/\/[^\s"'<>)]+)/gi);
            if (urlMatches) {
              urlMatches.forEach(url => allLinks.push(url));
            }
          }
        }

        // Strategy 3: Get all data attributes
        for (const el of document.querySelectorAll('[data-url], [data-href], [data-link]')) {
          const url = el.getAttribute('data-url') || el.getAttribute('data-href') || el.getAttribute('data-link');
          if (url) allLinks.push(url);
        }

        // Strategy 4: Extract from text content and HTML
        const htmlContent = document.documentElement.innerHTML;
        const urlPattern = /(https?:\/\/[^\s"'<>]+(?:\?[^\s"'<>]*)?)/gi;
        let match;
        while ((match = urlPattern.exec(htmlContent)) !== null) {
          allLinks.push(match[1]);
        }

        return allLinks;
      });

      await page.close();

      // Normalize and filter links
      const normalizedLinks = links
        .map(link => normalizeUrl(link, url))
        .filter(link => link !== null);

      // Remove duplicates
      const uniqueLinks = [...new Set(normalizedLinks)];

      console.log(`[puppeteer] Found ${uniqueLinks.length} links on attempt ${attempt}`);
      
      if (uniqueLinks.length > 0) {
        return uniqueLinks;
      }

      if (attempt < retries) {
        await sleep(2000);
      }

    } catch (err) {
      lastError = err;
      console.error(`[puppeteer] Error on attempt ${attempt}:`, err.message);
      
      if (attempt < retries) {
        await sleep(2000);
      }
    }
  }

  console.error('[puppeteer] Failed to scrape after all retries:', lastError?.message);
  return [];
}

function normalizeUrl(url, baseUrl) {
  if (!url || typeof url !== 'string') return null;

  try {
    // Handle relative URLs
    if (url.startsWith('/')) {
      const base = new URL(baseUrl);
      url = base.protocol + '//' + base.host + url;
    } else if (url.startsWith('.') || !url.startsWith('http')) {
      const base = new URL(baseUrl);
      url = base.protocol + '//' + base.host + '/' + url;
    }

    // Validate URL
    const urlObj = new URL(url);
    
    // Only return arras.io URLs
    if (urlObj.hostname === 'arras.io' || urlObj.hostname === 'www.arras.io') {
      return urlObj.toString();
    }
  } catch (e) {
    // Invalid URL, skip
  }

  return null;
}

/**
 * Extract team code and digit from URL
 */
function parseTeamUrl(url) {
  const input = String(url || '');
  const match = input.match(/(?:[?&#]q=|#)([a-zA-Z]{2,3}\d+)([1-4])\b/);
  if (match) {
    return {
      hash: match[1],
      digit: parseInt(match[2], 10)
    };
  }
  return null;
}

function detectBotTeam(currentUrl) {
  const match = currentUrl.match(/(\d)/);
  if (match) {
    return parseInt(match[1]);
  }
  return null;
}

async function scrapeAllTeams(gameHash, maxRetries = 5, proxyUrl = null) {
  const teamsFound = {};
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const baseUrl = `https://arras.io/#${gameHash}`;
      console.log(`[team-scraper] Attempt ${attempt}/${maxRetries} to scrape teams for hash: ${gameHash}${proxyUrl ? ' (with proxy)' : ''}`);
      
      const links = await scrapeLinks(baseUrl, 2, proxyUrl);
      
      if (!links || links.length === 0) {
        console.log(`[team-scraper] No links found on attempt ${attempt}`);
        if (attempt < maxRetries) {
          await sleep(2000);
          continue;
        }
      }

      // Extract arras.io team links with query parameters
      for (const link of links) {
        const teamData = parseTeamUrl(link);
        if (teamData && teamData.digit >= 1 && teamData.digit <= 4) {
          // Store both the hash and full URL for team
          if (!teamsFound[teamData.digit]) {
            teamsFound[teamData.digit] = {
              digit: teamData.digit,
              hash: teamData.hash,
              url: `https://arras.io/#${teamData.hash}${teamData.digit}`
            };
            console.log(`[team-scraper] Found team ${teamData.digit}: https://arras.io/#${teamData.hash}${teamData.digit}`);
          }
        }
      }

      // If we found some teams, return them
      if (Object.keys(teamsFound).length > 0) {
        console.log(`[team-scraper] Successfully scraped ${Object.keys(teamsFound).length} teams`);
        return Object.values(teamsFound);
      }

      if (attempt < maxRetries) {
        console.log(`[team-scraper] No valid teams yet, retrying in 2 seconds...`);
        await sleep(2000);
      }

    } catch (err) {
      console.error(`[team-scraper] Error on attempt ${attempt}:`, err.message);
      if (attempt < maxRetries) {
        await sleep(2000);
      }
    }
  }

  console.log('[team-scraper] Max retries reached');
  return Object.keys(teamsFound).length > 0 ? Object.values(teamsFound) : null;
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Cleanup: Close browser on process exit
 */
async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

/**
 * Listen for team codes on the page dynamically
 */
function monitorTeams(gameHash, onTeamFound) {
  const checkInterval = setInterval(async () => {
    try {
      const teams = await scrapeAllTeams(gameHash);
      if (teams && teams.length > 0) {
        for (const teamData of teams) {
          onTeamFound(teamData.digit, teamData.hash);
        }
      }
    } catch (err) {
      console.error('[monitor] Error:', err.message);
    }
  }, 3000);

  return checkInterval;
}

// Clean up on exit
process.on('exit', closeBrowser);
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

module.exports = {
  scrapeLinks,
  parseTeamUrl,
  detectBotTeam,
  scrapeAllTeams,
  monitorTeams,
  closeBrowser
};
