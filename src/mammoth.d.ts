declare module 'mammoth/mammoth.browser.js' {
  interface Result {
    value: string;
    messages: unknown[];
  }
  interface Input {
    arrayBuffer: ArrayBuffer;
  }
  const mammoth: {
    extractRawText(input: Input): Promise<Result>;
    convertToHtml(input: Input): Promise<Result>;
  };
  export default mammoth;
}
