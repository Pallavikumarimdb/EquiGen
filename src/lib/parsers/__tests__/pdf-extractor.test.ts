import { test, describe } from 'node:test';
import assert from 'node:assert';
import { PDFExtractor } from '../pdf-extractor';

describe('PDFExtractor Pipeline Tests', () => {
  // A dummy buffer representing a PDF
  const dummyBuffer = Buffer.from('%PDF-1.4 mock content');

  test('should use native text directly when it meets character threshold', async () => {
    const extractor = new PDFExtractor();
    extractor.threshold = 10;

    // Stub native text helper to return sufficient character length text
    extractor.extractNativePagesText = async () => ({
      pagesText: ['This page has sufficient native text.'],
      totalPages: 1
    });

    // Stub other helpers to ensure they are NOT called
    extractor.renderPageToImage = async () => {
      assert.fail('Should not render page to image for native text');
    };

    const result = await extractor.extract(dummyBuffer, 'test.pdf');
    assert.strictEqual(result.text, 'This page has sufficient native text.');
    assert.strictEqual(result.metadata.totalPages, 1);
  });

  test('should fall back to Tesseract OCR via render when native text is below threshold, no embedded image, and no graphics are present', async () => {
    const extractor = new PDFExtractor();
    extractor.threshold = 50;

    extractor.extractNativePagesText = async () => ({
      pagesText: ['Short'],
      totalPages: 1
    });

    // No embedded image on the page → fall back to the render path
    extractor.extractPageImageAsDataUrl = async () => null;

    let renderCalled = false;
    extractor.renderPageToImage = async () => {
      renderCalled = true;
      return 'data:image/png;base64,mock';
    };

    extractor.checkGraphics = async () => false;

    let ocrCalled = false;
    extractor.runOcrFallback = async (imgUrl) => {
      ocrCalled = true;
      assert.strictEqual(imgUrl, 'data:image/png;base64,mock');
      return 'Extracted OCR Text';
    };

    extractor.runVisionFallback = async () => {
      assert.fail('Should not run Vision fallback when graphics are absent');
    };

    const result = await extractor.extract(dummyBuffer, 'test.pdf');
    assert.ok(renderCalled);
    assert.ok(ocrCalled);
    assert.strictEqual(result.text, 'Extracted OCR Text');
  });

  test('should OCR the embedded image directly for scanned pages (no render)', async () => {
    const extractor = new PDFExtractor();
    extractor.threshold = 50;

    extractor.extractNativePagesText = async () => ({
      pagesText: [''],
      totalPages: 1
    });

    extractor.extractPageImageAsDataUrl = async () => 'data:image/png;base64,scan';
    extractor.renderPageToImage = async () => {
      assert.fail('Should not render pages with embedded images');
    };

    let ocrCalled = false;
    extractor.runOcrFallback = async (imgUrl) => {
      ocrCalled = true;
      assert.strictEqual(imgUrl, 'data:image/png;base64,scan');
      return 'Scanned OCR Text';
    };

    const result = await extractor.extract(dummyBuffer, 'test.pdf');
    assert.ok(ocrCalled);
    assert.strictEqual(result.text, 'Scanned OCR Text');
  });

  test('should fall back to Groq Vision when native text is below threshold, graphics are present, and API key exists', async () => {
    // Inject mock GROQ_API_KEY
    const prevKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'mock-key';

    try {
      const extractor = new PDFExtractor();
      extractor.threshold = 50;

      extractor.extractNativePagesText = async () => ({
        pagesText: ['Short'],
        totalPages: 1
      });

    extractor.renderPageToImage = async () => 'data:image/png;base64,mock';
    extractor.extractPageImageAsDataUrl = async () => null;
    extractor.checkGraphics = async () => true;

      let visionCalled = false;
      extractor.runVisionFallback = async (imgUrl, key) => {
        visionCalled = true;
        assert.strictEqual(imgUrl, 'data:image/png;base64,mock');
        assert.strictEqual(key, 'mock-key');
        return 'Extracted Vision Text';
      };

      extractor.runOcrFallback = async () => {
        assert.fail('Should not run OCR fallback when vision is triggered');
      };

      const result = await extractor.extract(dummyBuffer, 'test.pdf');
      assert.ok(visionCalled);
      assert.strictEqual(result.text, 'Extracted Vision Text');
    } finally {
      process.env.GROQ_API_KEY = prevKey;
    }
  });

  test('should gracefully return native text if both image extraction and fallbacks fail', async () => {
    const extractor = new PDFExtractor();
    extractor.threshold = 50;

    extractor.extractNativePagesText = async () => ({
      pagesText: ['Short text'],
      totalPages: 1
    });

    extractor.extractPageImageAsDataUrl = async () => {
      throw new Error('Image extraction failure');
    };

    const result = await extractor.extract(dummyBuffer, 'test.pdf');
    // Result should contain the original short native text instead of failing the whole parse
    assert.strictEqual(result.text, 'Short text');
  });
});
