import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Window } from 'happy-dom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('index.html smoke test', () => {
  let window;
  let document;

  beforeAll(() => {
    // Read the HTML file from the root directory
    const htmlPath = join(__dirname, '../../index.html');
    const html = readFileSync(htmlPath, 'utf-8');
    
    // Create a happy-dom window
    window = new Window();
    document = window.document;
    document.write(html);
  });

  afterAll(() => {
    window.close();
  });

  it('should have the correct page title', () => {
    const title = document.querySelector('title');
    expect(title).not.toBeNull();
    expect(title.textContent).toBe('Connection Hub - Onboarding Wizard');
  });

  it('should render the welcome heading', () => {
    const heading = document.querySelector('.welcome-title');
    expect(heading).not.toBeNull();
    expect(heading.textContent).toBe('Welcome to Connection Hub');
  });

  it('should have the welcome subtitle', () => {
    const subtitle = document.querySelector('.welcome-subtitle');
    expect(subtitle).not.toBeNull();
    expect(subtitle.textContent).toContain('Set up and manage multiple HTTP');
  });

  it('should have a Get Started button', () => {
    const button = document.querySelector('button.btn--primary');
    expect(button).not.toBeNull();
    expect(button.textContent).toBe('Get Started');
  });

  it('should have the credentials warning banner', () => {
    const warning = document.querySelector('#credentialsWarning');
    expect(warning).not.toBeNull();
    expect(warning.textContent).toContain('Demo frontend');
  });

  it('should have progress bar with 6 steps', () => {
    const steps = document.querySelectorAll('.progress-step');
    expect(steps.length).toBe(6);
  });

  it('should have all wizard steps', () => {
    const step1 = document.querySelector('#step1');
    const step2 = document.querySelector('#step2');
    const step3 = document.querySelector('#step3');
    const step4 = document.querySelector('#step4');
    const step5 = document.querySelector('#step5');
    const step6 = document.querySelector('#step6');
    const dashboard = document.querySelector('#dashboard');

    expect(step1).not.toBeNull();
    expect(step2).not.toBeNull();
    expect(step3).not.toBeNull();
    expect(step4).not.toBeNull();
    expect(step5).not.toBeNull();
    expect(step6).not.toBeNull();
    expect(dashboard).not.toBeNull();
  });

  it('should include the app.js script', () => {
    const script = document.querySelector('script[src="app.js"]');
    expect(script).not.toBeNull();
  });

  it('should include the stylesheet', () => {
    const link = document.querySelector('link[href="style.css"]');
    expect(link).not.toBeNull();
  });
});
