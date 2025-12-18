import { JSDOM } from "jsdom";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL parameter is required" }, { status: 400 });
  }

  // Only allow http and https URLs
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    // If URL constructor fails, treat as unsupported
    return NextResponse.json({
      title: url,
      description: null,
      image: null,
      siteName: url,
      url,
      error: "Unsupported or invalid URL scheme"
    });
  }

  if (parsedUrl.protocol !== "https:") {
    // Only allow https URLs for security; reject http and other protocols
    return NextResponse.json({
      title: parsedUrl.hostname || url,
      description: null,
      image: null,
      siteName: parsedUrl.hostname || url,
      url,
      error: `Only https URLs are allowed. Unsupported URL protocol: ${parsedUrl.protocol}`
    });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Referer": "https://nounspace.com/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
      },
      signal: AbortSignal.timeout(8000), // 8 second timeout - reduced to fail faster
    });

    if (!response.ok) {
      // Handle common HTTP errors gracefully
      if (response.status === 403) {
        throw new Error(`Access denied by ${parsedUrl.hostname}. Site may be blocking automated requests.`);
      } else if (response.status === 404) {
        throw new Error(`Page not found: ${response.statusText}`);
      } else if (response.status >= 500) {
        throw new Error(`Server error from ${parsedUrl.hostname}: ${response.statusText}`);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract OpenGraph metadata
    const getMetaContent = (property: string): string | null => {
      const element = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
      return element?.getAttribute("content") || null;
    };

    const title = getMetaContent("og:title") || 
                  getMetaContent("twitter:title") || 
                  document.querySelector("title")?.textContent || 
                  null;

    const description = getMetaContent("og:description") || 
                       getMetaContent("twitter:description") || 
                       getMetaContent("description") || 
                       null;

    let image = getMetaContent("og:image") || 
                getMetaContent("twitter:image") || 
                null;

    let video = getMetaContent("og:video") || 
                getMetaContent("twitter:player") || 
                null;

    // Filter out video URLs from image field (e.g., .m3u8, .mp4, etc.)
    if (image) {
      const imageUrl = image.toLowerCase();
      const videoExtensions = ['.m3u8', '.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv'];
      const isVideoUrl = videoExtensions.some(ext => imageUrl.includes(ext)) || 
                         imageUrl.includes('/video/') ||
                         imageUrl.includes('video/upload');
      
      if (isVideoUrl) {
        // Move video URL from image to video field
        if (!video) {
          video = image;
        }
        image = null;
      }
    }

    const siteName = getMetaContent("og:site_name") || 
                     new URL(url).hostname;

    const ogData = {
      title,
      description,
      image,
      video,
      siteName,
      url,
    };

    // ...existing code...

    return NextResponse.json(ogData);
  } catch (error) {
    console.error("Error fetching OpenGraph data:", error);
    
    // Return minimal fallback data
    return NextResponse.json({
      title: parsedUrl?.hostname || url,
      description: null,
      image: null,
      video: null,
      siteName: parsedUrl?.hostname || url,
      url,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
