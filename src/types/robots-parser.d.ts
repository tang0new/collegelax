declare module 'robots-parser' {
  type RobotsParser = {
    isAllowed: (url: string, userAgent?: string) => boolean;
  };

  export default function robotsParser(url: string, contents: string): RobotsParser;
}
