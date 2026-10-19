import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import WellnessHeader from './WellnessHeader';

const render = (props: React.ComponentProps<typeof WellnessHeader>) =>
  renderToString(
    <MemoryRouter>
      <WellnessHeader {...props} />
    </MemoryRouter>
  );

describe('WellnessHeader', () => {
  it('pages that do not opt in render the same header row as before', () => {
    expect(render({ title: 'Breathing' })).toContain(
      '<header class="w-full max-w-lg mx-auto p-4 flex items-center justify-between">'
    );
  });

  it('the back button has an accessible name', () => {
    expect(render({ title: 'Safe Contacts' })).toMatch(/<button[^>]*aria-label="Back"/);
  });
});
