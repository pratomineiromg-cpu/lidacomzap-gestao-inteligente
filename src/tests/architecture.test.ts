import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Architectural Integrity Tests', () => {
  it('Test 18 - Should not import MockRepository directly in core business logic', () => {
    const actionsContent = fs.readFileSync(path.join(__dirname, '../services/Actions.ts'), 'utf-8');
    const eventEngineContent = fs.readFileSync(path.join(__dirname, '../events/EventEngine.ts'), 'utf-8');

    // Strict regex against importing the concrete implementation
    expect(actionsContent).not.toMatch(/MockDatabase/);
    expect(actionsContent).not.toMatch(/MockRepository/);
    expect(eventEngineContent).not.toMatch(/MockDatabase/);
    expect(eventEngineContent).not.toMatch(/MockRepository/);
    
    // Strict regex against the forbidden generic update pattern
    expect(actionsContent).not.toMatch(/\.update\s*\(/);
    expect(eventEngineContent).not.toMatch(/\.update\s*\(/);
  });
});
