import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createClient } from '../index';

describe('nullable discriminated unions', () => {
  let output: string;

  beforeEach(() => {
    output = fs.mkdtempSync(path.join(os.tmpdir(), 'hey-api-nullable-discriminator-'));
  });

  afterEach(() => {
    fs.rmSync(output, { force: true, recursive: true });
  });

  describe.each([
    { nullSchema: undefined, openapi: '3.0.3' },
    { nullSchema: { type: 'null' }, openapi: '3.1.0' },
    { nullSchema: { const: null }, openapi: '3.1.0' },
  ])('OpenAPI $openapi with $nullSchema', ({ nullSchema, openapi }) => {
    describe.each(['oneOf', 'anyOf'])('%s', (composition) => {
      describe.each([true, false])('explicit mapping: %s', (explicitMapping) => {
        it.each([true, false])('preserves nullable: %s', async (nullable) => {
          const content = {
            [composition]: [
              { $ref: '#/components/schemas/TextContent' },
              { $ref: '#/components/schemas/ImageContent' },
              ...(nullable && nullSchema ? [nullSchema] : []),
            ],
            discriminator: {
              ...(explicitMapping && {
                mapping: {
                  image: '#/components/schemas/ImageContent',
                  text: '#/components/schemas/TextContent',
                },
              }),
              propertyName: 'kind',
            },
            ...(!nullSchema && { nullable }),
          };

          await createClient({
            input: {
              components: {
                schemas: {
                  Card: {
                    properties: { content },
                    required: ['content'],
                    type: 'object',
                  },
                  Content: content,
                  ImageContent: {
                    properties: {
                      kind: { enum: [explicitMapping ? 'image' : 'ImageContent'], type: 'string' },
                      url: { type: 'string' },
                    },
                    required: ['kind', 'url'],
                    type: 'object',
                  },
                  TextContent: {
                    properties: {
                      kind: { enum: [explicitMapping ? 'text' : 'TextContent'], type: 'string' },
                      text: { type: 'string' },
                    },
                    required: ['kind', 'text'],
                    type: 'object',
                  },
                },
              },
              info: { title: 'nullable discriminator', version: '1.0.0' },
              openapi,
              paths: {},
            },
            logs: { level: 'silent' },
            output,
            plugins: ['@hey-api/typescript'],
          });

          const types = fs
            .readFileSync(path.join(output, 'types.gen.ts'), 'utf8')
            .replace(/\s+/g, ' ');
          const union =
            `({ kind: '${explicitMapping ? 'text' : 'TextContent'}'; } & TextContent) | ` +
            `({ kind: '${explicitMapping ? 'image' : 'ImageContent'}'; } & ImageContent)` +
            (nullable ? ' | null' : '');

          expect(types).toContain(`export type Card = { content: ${union}; };`);
          expect(types).toContain(`export type Content = ${union};`);
        });
      });
    });
  });
});
