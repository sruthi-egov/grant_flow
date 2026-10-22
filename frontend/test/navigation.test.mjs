/**
 * Tests for the sidebar navigation rules.
 *
 * Uses Node's built-in test runner (`node --test`) so the layout change adds
 * no new dependency to the frontend.
 *
 *   npm run test
 *
 * These cover the role and module visibility rules that moved out of
 * Layout.jsx. Getting them wrong would silently expose or hide menu entries,
 * which a build or lint pass cannot detect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTRACTS_PAGES,
  filterNavigation,
  getPageTitle,
  isModuleAllowed,
  navSections,
} from '../src/lib/navigation.js';

const ADMIN = { isAdmin: true, allowedModules: [] };
const UNRESTRICTED_USER = { isAdmin: false, allowedModules: [] };
const RESTRICTED_USER = { isAdmin: false, allowedModules: ['Grants', 'MOUs'] };

/** Flattens groups so a page can be looked up regardless of nesting. */
function pagesOf(sections) {
  return sections.flatMap((s) => (s.type === 'group' ? s.items.map((i) => i.page) : [s.page]));
}

test('navigation config is unchanged in shape and order', () => {
  assert.equal(navSections.length, 10);
  assert.deepEqual(
    navSections.map((s) => s.label),
    [
      'Dashboard', 'Contracts & Agreements', 'SOWs', 'Reports', 'Doc Intelligence',
      'Calendar', 'Audit Trail', 'Archive', 'Settings', 'Users',
    ],
  );

  const group = navSections.find((s) => s.type === 'group');
  assert.deepEqual(group.items.map((i) => i.page), CONTRACTS_PAGES);
});

test('every entry has a label and an icon', () => {
  for (const section of navSections) {
    assert.ok(section.label, 'section needs a label');
    assert.ok(section.icon, `${section.label} needs an icon`);
    if (section.type === 'group') {
      for (const item of section.items) {
        assert.ok(item.label && item.icon && item.page, `${item.label} is incomplete`);
      }
    } else {
      assert.ok(section.page, `${section.label} needs a page`);
    }
  }
});

test('admin sees every entry, including admin-only ones', () => {
  const pages = pagesOf(filterNavigation(navSections, ADMIN));
  for (const adminPage of ['AuditTrail', 'Settings', 'UserAdmin']) {
    assert.ok(pages.includes(adminPage), `admin should see ${adminPage}`);
  }
  assert.equal(pages.length, 12); // 9 top-level items + 3 grouped
});

test('non-admin never sees admin-only entries', () => {
  const pages = pagesOf(filterNavigation(navSections, UNRESTRICTED_USER));
  for (const adminPage of ['AuditTrail', 'Settings', 'UserAdmin']) {
    assert.ok(!pages.includes(adminPage), `${adminPage} must be hidden from non-admins`);
  }
});

test('an empty allowed_modules means unrestricted, not blocked', () => {
  const pages = pagesOf(filterNavigation(navSections, UNRESTRICTED_USER));
  for (const page of ['Grants', 'MSAs', 'MOUs', 'SOWs']) {
    assert.ok(pages.includes(page), `${page} should be visible when no modules are set`);
  }
});

test('a restricted user sees only their modules', () => {
  const pages = pagesOf(filterNavigation(navSections, RESTRICTED_USER));

  assert.ok(pages.includes('Grants'));
  assert.ok(pages.includes('MOUs'));
  assert.ok(!pages.includes('MSAs'), 'MSAs is not granted');
  assert.ok(!pages.includes('SOWs'), 'SOWs is not granted');

  // Ungated entries stay visible.
  assert.ok(pages.includes('Dashboard'));
  assert.ok(pages.includes('Reports'));
  assert.ok(pages.includes('Calendar'));
});

test('the contracts group disappears when none of its children are allowed', () => {
  const sections = filterNavigation(navSections, { isAdmin: false, allowedModules: ['SOWs'] });
  assert.ok(!sections.some((s) => s.type === 'group'), 'empty group must be removed');
  assert.ok(pagesOf(sections).includes('SOWs'));
});

test('the contracts group keeps only the permitted children', () => {
  const sections = filterNavigation(navSections, { isAdmin: false, allowedModules: ['MOUs'] });
  const group = sections.find((s) => s.type === 'group');
  assert.deepEqual(group.items.map((i) => i.page), ['MOUs']);
});

test('filtering never mutates the source configuration', () => {
  const before = JSON.stringify(navSections.map((s) => s.label));
  filterNavigation(navSections, RESTRICTED_USER);
  filterNavigation(navSections, { isAdmin: false, allowedModules: ['SOWs'] });
  assert.equal(JSON.stringify(navSections.map((s) => s.label)), before);

  const group = navSections.find((s) => s.type === 'group');
  assert.equal(group.items.length, 3, 'group children must not be filtered in place');
});

test('missing permission data is treated as an unrestricted non-admin', () => {
  const pages = pagesOf(filterNavigation(navSections, {}));
  assert.ok(pages.includes('Grants'));
  assert.ok(!pages.includes('UserAdmin'));
});

test('isModuleAllowed matches the previous rules exactly', () => {
  assert.equal(isModuleAllowed(null, RESTRICTED_USER), true, 'ungated entries are always allowed');
  assert.equal(isModuleAllowed('MSAs', ADMIN), true, 'admins bypass module gates');
  assert.equal(isModuleAllowed('MSAs', UNRESTRICTED_USER), true, 'empty list means unrestricted');
  assert.equal(isModuleAllowed('MSAs', RESTRICTED_USER), false);
  assert.equal(isModuleAllowed('Grants', RESTRICTED_USER), true);
});

test('page titles come from the menu labels', () => {
  assert.equal(getPageTitle('Dashboard'), 'Dashboard');
  assert.equal(getPageTitle('DocumentIntelligence'), 'Doc Intelligence');
  assert.equal(getPageTitle('UserAdmin'), 'Users');
  assert.equal(getPageTitle('MOUs'), 'MOUs', 'grouped pages resolve too');
});

test('pages outside the menu fall back to a readable title', () => {
  assert.equal(getPageTitle('GrantDetail'), 'Grant Detail');
  assert.equal(getPageTitle('MOUDetail'), 'MOU Detail');
  assert.equal(getPageTitle('InvalidFileCleanup'), 'Invalid File Cleanup');
  assert.equal(getPageTitle(''), '');
  assert.equal(getPageTitle(undefined), '');
});
