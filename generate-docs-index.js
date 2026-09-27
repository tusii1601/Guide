const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const OUTPUT_PATH = path.join(ROOT_DIR, 'docs-index.json');

function naturalCompare(a, b) {
  const regex = /(\d+)/g;
  const aMatches = a.match(regex) || [];
  const bMatches = b.match(regex) || [];
  const maxLength = Math.max(aMatches.length, bMatches.length);

  for (let i = 0; i < maxLength; i += 1) {
    const aPart = aMatches[i] || '';
    const bPart = bMatches[i] || '';

    if (aPart === bPart) {
      const aText = a.replace(/\d+/g, '');
      const bText = b.replace(/\d+/g, '');
      if (aText !== bText) {
        return aText.localeCompare(bText);
      }
      continue;
    }

    const aNum = Number.parseInt(aPart, 10) || 0;
    const bNum = Number.parseInt(bPart, 10) || 0;
    if (aNum !== bNum) {
      return aNum - bNum;
    }
  }

  return a.localeCompare(b);
}

function formatTitle(value) {
  if (!value) return 'Untitled';
  let text = value.replace(/\.[^.]+$/, '');
  text = text.replace(/^\d+[_\-\s]*/, '');
  text = text.replace(/[_-]+/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  text = text
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const lowered = word.toLowerCase();
      const preserve = ['and', 'or', 'of', 'in', 'a', 'an', 'to'];
      if (preserve.includes(lowered) && text !== word) {
        return lowered;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  return text || 'Untitled';
}

function createFileEntry(fileName, folderRelativePath) {
  const filePath = path.posix.join('docs', folderRelativePath, fileName);
  const title = formatTitle(fileName);
  return {
    name: fileName,
    title,
    path: filePath,
  };
}

function scanFolder(currentDir, relativeDir = '') {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  const fileEntries = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => createFileEntry(entry.name, relativeDir))
    .sort((a, b) => naturalCompare(a.name, b.name));

  const childFolders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const childRelativeDir = path.posix.join(relativeDir, entry.name);
      return scanFolder(path.join(currentDir, entry.name), childRelativeDir);
    })
    .sort((a, b) => naturalCompare(a.name, b.name));

  const folderName = path.basename(currentDir);
  const folderPath = relativeDir ? path.posix.join('docs', relativeDir) : 'docs';

  return {
    name: folderName,
    title: formatTitle(folderName),
    path: folderPath,
    files: fileEntries,
    children: childFolders,
  };
}

if (!fs.existsSync(DOCS_DIR)) {
  throw new Error(`Docs directory not found at ${DOCS_DIR}`);
}

const folderEntries = fs
  .readdirSync(DOCS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => scanFolder(path.join(DOCS_DIR, entry.name), entry.name))
  .sort((a, b) => naturalCompare(a.name, b.name));

const index = {
  folders: folderEntries,
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
console.log(`Generated docs index with ${folderEntries.length} folders at ${OUTPUT_PATH}`);
