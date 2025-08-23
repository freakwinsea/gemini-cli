/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';

describe('replace', () => {
  it('should be able to replace content in a file', async () => {
    const rig = new TestRig();
    await rig.setup('should be able to replace content in a file');

    const fileName = 'file_to_replace.txt';
    const originalContent = 'original content';
    const expectedContent = 'replaced content';

    rig.createFile(fileName, originalContent);
    const prompt = `Can you replace 'original' with 'replaced' in the file 'file_to_replace.txt'`;

    const result = await rig.run(prompt);

    const foundToolCall = await rig.waitForToolCall('replace');

    // Add debugging information
    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }

    expect(foundToolCall, 'Expected to find a replace tool call').toBeTruthy();

    // Validate model output - will throw if no output, warn if missing expected content
    validateModelOutput(
      result,
      ['replaced', 'file_to_replace.txt'],
      'Replace content test',
    );

    const replaceToolLog = rig
      .readToolLogs()
      .find((log) => log.toolRequest.name === 'replace');

    expect(replaceToolLog?.toolResult.returnDisplay).toBe(expectedContent);

    const newFileContent = rig.readFile(fileName);

    // Add debugging for file content
    if (newFileContent !== expectedContent) {
      console.error('File content mismatch - Debug info:');
      console.error('Expected:', expectedContent);
      console.error('Actual:', newFileContent);
      console.error(
        'Tool calls:',
        rig.readToolLogs().map((t) => ({
          name: t.toolRequest.name,
          args: t.toolRequest.args,
        })),
      );
    }

    expect(newFileContent).toBe(expectedContent);

    // Log success info if verbose
    vi.stubEnv('VERBOSE', 'true');
    if (process.env['VERBOSE'] === 'true') {
      console.log('File replaced successfully. New content:', newFileContent);
    }
  });

  it('should be able to dry run a replacement', async () => {
    const rig = new TestRig();
    await rig.setup('should be able to dry run a replacement');

    const fileName = 'file_to_replace.txt';
    const originalContent = 'original content';
    const expectedContent = 'replaced content';

    rig.createFile(fileName, originalContent);
    const prompt = `Can you replace 'original' with 'replaced' in the file 'file_to_replace.txt'`;

    const result = await rig.run({ prompt, dryRun: true });

    const foundToolCall = await rig.waitForToolCall('replace');

    // Add debugging information
    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }

    expect(foundToolCall, 'Expected to find a replace tool call').toBeTruthy();

    // Validate model output - will throw if no output, warn if missing expected content
    validateModelOutput(
      result,
      ['replaced', 'file_to_replace.txt'],
      'Replace content test',
    );

    const replaceToolLog = rig
      .readToolLogs()
      .find((log) => log.toolRequest.name === 'replace');

    expect(replaceToolLog?.toolResult.returnDisplay).toBe(expectedContent);

    const newFileContent = rig.readFile(fileName);

    // Add debugging for file content
    if (newFileContent !== originalContent) {
      console.error('File content mismatch - Debug info:');
      console.error('Expected:', originalContent);
      console.error('Actual:', newFileContent);
      console.error(
        'Tool calls:',
        rig.readToolLogs().map((t) => ({
          name: t.toolRequest.name,
          args: t.toolRequest.args,
        })),
      );
    }

    expect(newFileContent).toBe(originalContent);
  });
});
