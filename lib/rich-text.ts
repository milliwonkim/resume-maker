import type {
  EducationContent,
  EducationAdditionalMajor,
  EducationItem,
  ExperienceContent,
  ExperienceItem,
  ExperienceProject,
  HeaderContent,
  ProjectItem,
  ProjectsContent,
  ResumeImage,
  RichTextDocument,
  RichTextMark,
  RichTextMarkType,
  RichTextNode,
  SectionContent,
  SectionType,
  SkillCategory,
  SkillsContent,
  SummaryContent,
  TextContent,
} from '@/lib/types';
import { makeRichTextDocument } from '@/lib/types';

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i;
const CODE_FENCE_PATTERN = /^```(?:html|markdown|md)?\s*([\s\S]*?)\s*```$/i;
const UNORDERED_LIST_PATTERN = /^\s*[-*]\s+(.+)$/;
const ORDERED_LIST_PATTERN = /^\s*\d+[.)]\s+(.+)$/;
const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  nbsp: ' ',
};
const MARK_PATTERNS = [
  { marker: '**', type: 'bold' },
  { marker: '__', type: 'bold' },
  { marker: '++', type: 'underline' },
  { marker: '~~', type: 'strike' },
  { marker: '*', type: 'italic' },
] as const;
const MARK_WRAPPERS: Record<RichTextMarkType, string> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  underline: '++',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&([^;]+);/g, (_, entity: string) => {
    if (entity.startsWith('#x')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isNaN(code) ? `&${entity};` : String.fromCharCode(code);
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? `&${entity};` : String.fromCharCode(code);
    }
    return HTML_ENTITY_MAP[entity] ?? `&${entity};`;
  });
}

function stripCodeFence(value: string): string {
  const match = value.trim().match(CODE_FENCE_PATTERN);
  return match?.[1] ?? value;
}

function htmlToMarkdown(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*(strong|b)\s*>/gi, '**')
    .replace(/<\s*\/\s*(strong|b)\s*>/gi, '**')
    .replace(/<\s*(em|i)\s*>/gi, '*')
    .replace(/<\s*\/\s*(em|i)\s*>/gi, '*')
    .replace(/<\s*u\s*>/gi, '++')
    .replace(/<\s*\/\s*u\s*>/gi, '++')
    .replace(/<\s*s\s*>/gi, '~~')
    .replace(/<\s*\/\s*s\s*>/gi, '~~')
    .replace(/<\s*li\s*>/gi, '\n- ')
    .replace(/<\s*\/\s*li\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|ul|ol)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlToPlainText(value: string): string {
  return decodeHtmlEntities(
    htmlToMarkdown(value).replace(/\*\*|__|\+\+|~~|\*/g, '')
  );
}

function normalizePlainTextValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = stripCodeFence(value).trim();
  return HTML_TAG_PATTERN.test(trimmed)
    ? htmlToPlainText(trimmed)
    : decodeHtmlEntities(trimmed);
}

function textNode(text: string, marks: RichTextMark[] = []): RichTextNode {
  return marks.length > 0
    ? { type: 'text', text, marks }
    : { type: 'text', text };
}

function parseInline(
  value: string,
  marks: RichTextMark[] = []
): RichTextNode[] {
  const matches = MARK_PATTERNS.map(({ marker, type }) => {
    const start = value.indexOf(marker);
    if (start < 0) return null;
    const end = value.indexOf(marker, start + marker.length);
    if (end < 0) return null;
    return { marker, type, start, end };
  }).filter((match) => match !== null);

  const first = matches.sort((a, b) => a.start - b.start)[0];
  if (!first) return value ? [textNode(decodeHtmlEntities(value), marks)] : [];

  const before = value.slice(0, first.start);
  const marked = value.slice(first.start + first.marker.length, first.end);
  const after = value.slice(first.end + first.marker.length);
  return [
    ...parseInline(before, marks),
    ...parseInline(marked, [...marks, { type: first.type }]),
    ...parseInline(after, marks),
  ];
}

function paragraph(content: string): RichTextNode {
  const inlineContent = parseInline(content);
  return {
    type: 'paragraph',
    content: inlineContent.length > 0 ? inlineContent : undefined,
  };
}

function listItem(content: string): RichTextNode {
  return {
    type: 'listItem',
    content: [paragraph(content)],
  };
}

function markdownToDocument(value: string): RichTextDocument {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const blocks: RichTextNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const unorderedContent = line.match(UNORDERED_LIST_PATTERN)?.[1];
    const orderedContent = line.match(ORDERED_LIST_PATTERN)?.[1];
    if (unorderedContent !== undefined || orderedContent !== undefined) {
      const isOrdered = orderedContent !== undefined;
      const items: RichTextNode[] = [];

      while (index < lines.length) {
        const content = lines[index].match(
          isOrdered ? ORDERED_LIST_PATTERN : UNORDERED_LIST_PATTERN
        )?.[1];
        if (content === undefined) break;
        items.push(listItem(content));
        index += 1;
      }

      blocks.push({
        type: isOrdered ? 'orderedList' : 'bulletList',
        content: items,
      });
      continue;
    }

    blocks.push(paragraph(line));
    index += 1;
  }

  return {
    type: 'doc',
    content: blocks.length > 0 ? blocks : makeRichTextDocument().content,
  };
}

function sanitizeMarks(value: unknown): RichTextMark[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const marks = value
    .filter(isRecord)
    .map((mark): RichTextMark | null => {
      const type = mark.type;
      if (
        type === 'bold' ||
        type === 'italic' ||
        type === 'strike' ||
        type === 'underline'
      ) {
        return { type };
      }
      return null;
    })
    .filter((mark) => mark !== null);
  return marks.length > 0 ? marks : undefined;
}

function sanitizeNode(value: unknown): RichTextNode | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  const content = Array.isArray(value.content)
    ? value.content.map(sanitizeNode).filter((node) => node !== null)
    : undefined;

  if (value.type === 'text') {
    const text = typeof value.text === 'string' ? value.text : '';
    if (!text) return null;
    return {
      type: 'text',
      text,
      marks: sanitizeMarks(value.marks),
    };
  }

  const allowedTypes = new Set([
    'doc',
    'paragraph',
    'bulletList',
    'orderedList',
    'listItem',
    'hardBreak',
  ]);
  if (!allowedTypes.has(value.type)) return null;

  return {
    type: value.type,
    content: content && content.length > 0 ? content : undefined,
  };
}

function isRichTextDocument(value: unknown): value is RichTextDocument {
  return (
    isRecord(value) && value.type === 'doc' && Array.isArray(value.content)
  );
}

export function normalizeRichTextValue(value: unknown): RichTextDocument {
  if (isRichTextDocument(value)) {
    const sanitized = sanitizeNode(value);
    if (sanitized?.type === 'doc') {
      return {
        type: 'doc',
        content:
          sanitized.content && sanitized.content.length > 0
            ? sanitized.content
            : makeRichTextDocument().content,
      };
    }
  }

  if (typeof value !== 'string') return makeRichTextDocument();

  const trimmed = stripCodeFence(value).trim();
  if (!trimmed) return makeRichTextDocument();
  return markdownToDocument(
    HTML_TAG_PATTERN.test(trimmed) ? htmlToMarkdown(trimmed) : trimmed
  );
}

function normalizeOptionalRichText(
  value: unknown
): RichTextDocument | undefined {
  const document = normalizeRichTextValue(value);
  return richTextToPlainText(document).trim() ? document : undefined;
}

function normalizeResumeImage(value: unknown): ResumeImage | null {
  if (!isRecord(value)) return null;
  const src = normalizePlainTextValue(value.src);
  if (!src) return null;

  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    src,
    path: normalizePlainTextValue(value.path),
    alt: normalizePlainTextValue(value.alt) || '첨부 사진',
    caption: normalizePlainTextValue(value.caption),
  };
}

function normalizeResumeImages(value: unknown): ResumeImage[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeResumeImage).filter((image) => image !== null);
}

function normalizeExperienceProject(value: unknown): ExperienceProject | null {
  if (!isRecord(value)) return null;
  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    name: normalizePlainTextValue(value.name),
    startDate: normalizePlainTextValue(value.startDate),
    endDate: normalizePlainTextValue(value.endDate),
    tech: normalizePlainTextValue(value.tech),
    images: normalizeResumeImages(value.images),
    problem: normalizeOptionalRichText(value.problem),
    ownership: normalizeOptionalRichText(value.ownership),
    achievement: normalizeOptionalRichText(value.achievement),
  };
}

function normalizeExperienceItem(value: unknown): ExperienceItem | null {
  if (!isRecord(value)) return null;
  const projects = Array.isArray(value.projects)
    ? value.projects
        .map(normalizeExperienceProject)
        .filter((project) => project !== null)
    : undefined;

  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    company: normalizePlainTextValue(value.company),
    role: normalizePlainTextValue(value.role),
    location: normalizePlainTextValue(value.location),
    startDate: normalizePlainTextValue(value.startDate),
    endDate: normalizePlainTextValue(value.endDate),
    images: normalizeResumeImages(value.images),
    projects,
    tech: normalizePlainTextValue(value.tech),
    problem: normalizeOptionalRichText(value.problem),
    ownership: normalizeOptionalRichText(value.ownership),
    achievement: normalizeOptionalRichText(value.achievement),
    description: normalizeOptionalRichText(value.description),
  };
}

function normalizeProjectItem(value: unknown): ProjectItem | null {
  if (!isRecord(value)) return null;
  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    name: normalizePlainTextValue(value.name),
    description: normalizeRichTextValue(value.description),
    tech: normalizePlainTextValue(value.tech),
    link: normalizePlainTextValue(value.link),
    images: normalizeResumeImages(value.images),
  };
}

function normalizeHeaderContent(
  content: Record<string, unknown>
): HeaderContent {
  return {
    name: normalizePlainTextValue(content.name),
    title: normalizePlainTextValue(content.title),
    email: normalizePlainTextValue(content.email),
    phone: normalizePlainTextValue(content.phone),
    location: normalizePlainTextValue(content.location),
    linkedin: normalizePlainTextValue(content.linkedin),
    github: normalizePlainTextValue(content.github),
    website: normalizePlainTextValue(content.website),
  };
}

function normalizeEducationItem(value: unknown): EducationItem | null {
  if (!isRecord(value)) return null;
  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    schoolType:
      value.schoolType === 'highschool' || value.schoolType === 'middleschool'
        ? value.schoolType
        : 'university',
    school: normalizePlainTextValue(value.school),
    degree: normalizePlainTextValue(value.degree),
    field: normalizePlainTextValue(value.field),
    additionalMajors: Array.isArray(value.additionalMajors)
      ? value.additionalMajors.filter(isRecord).map((major) => ({
          id: typeof major.id === 'string' ? major.id : crypto.randomUUID(),
          label: normalizePlainTextValue(major.label),
          field: normalizePlainTextValue(major.field),
        }))
      : [],
    highSchoolCategory: normalizePlainTextValue(value.highSchoolCategory),
    startDate: normalizePlainTextValue(value.startDate),
    endDate: normalizePlainTextValue(value.endDate),
    gpa: normalizePlainTextValue(value.gpa),
    gpaScale:
      value.gpaScale === '4.3' || value.gpaScale === '4.0'
        ? value.gpaScale
        : '4.5',
  };
}

function normalizeSkillsContent(
  content: Record<string, unknown>
): SkillsContent {
  const categories = Array.isArray(content.categories)
    ? content.categories.filter(isRecord).map((category) => ({
        id: typeof category.id === 'string' ? category.id : crypto.randomUUID(),
        name: normalizePlainTextValue(category.name),
        skills: normalizePlainTextValue(category.skills),
      }))
    : [];
  return { categories };
}

export function normalizeSectionContent(
  sectionType: SectionType,
  content: unknown
): SectionContent {
  if (!isRecord(content)) {
    if (sectionType === 'summary' || sectionType === 'text') {
      return { text: normalizeRichTextValue(content) } satisfies
        | SummaryContent
        | TextContent;
    }
    if (sectionType === 'experience')
      return { items: [] } satisfies ExperienceContent;
    if (sectionType === 'education')
      return { items: [] } satisfies EducationContent;
    if (sectionType === 'skills')
      return { categories: [] } satisfies SkillsContent;
    if (sectionType === 'projects')
      return { items: [] } satisfies ProjectsContent;
    return {
      name: '',
      title: '',
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      github: '',
      website: '',
    } satisfies HeaderContent;
  }

  if (sectionType === 'header') return normalizeHeaderContent(content);

  if (sectionType === 'summary' || sectionType === 'text') {
    return { ...content, text: normalizeRichTextValue(content.text) } as
      | SummaryContent
      | TextContent;
  }

  if (sectionType === 'experience') {
    const items = Array.isArray(content.items)
      ? content.items
          .map(normalizeExperienceItem)
          .filter((item) => item !== null)
      : [];
    return { ...content, items } as ExperienceContent;
  }

  if (sectionType === 'projects') {
    const items = Array.isArray(content.items)
      ? content.items.map(normalizeProjectItem).filter((item) => item !== null)
      : [];
    return { ...content, items } as ProjectsContent;
  }

  if (sectionType === 'education') {
    const items = Array.isArray(content.items)
      ? content.items
          .map(normalizeEducationItem)
          .filter((item) => item !== null)
      : [];
    return { items } satisfies EducationContent;
  }

  if (sectionType === 'skills') return normalizeSkillsContent(content);

  return normalizeHeaderContent(content);
}

export function richTextToPlainText(value: RichTextDocument): string {
  const walk = (node: RichTextNode): string => {
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'hardBreak') return '\n';
    const text = node.content?.map(walk).join('') ?? '';
    if (
      node.type === 'paragraph' ||
      node.type === 'listItem' ||
      node.type === 'bulletList' ||
      node.type === 'orderedList'
    ) {
      return `${text}\n`;
    }
    return text;
  };

  return value.content.map(walk).join('').trim();
}

export function isEmptyRichText(value: RichTextDocument | undefined): boolean {
  return !value || richTextToPlainText(value).trim() === '';
}

function richTextNodeToMarkdown(node: RichTextNode, index = 0): string {
  if (node.type === 'text') {
    const text = node.text ?? '';
    if (!node.marks || node.marks.length === 0) return text;
    return node.marks.reduce((value, mark) => {
      const wrapper = MARK_WRAPPERS[mark.type];
      return `${wrapper}${value}${wrapper}`;
    }, text);
  }

  if (node.type === 'hardBreak') return '\n';

  const content =
    node.content?.map((child, childIndex) =>
      richTextNodeToMarkdown(child, childIndex)
    ) ?? [];

  if (node.type === 'bulletList') {
    return content.map((item) => `- ${item.trim()}`).join('\n');
  }

  if (node.type === 'orderedList') {
    return content
      .map((item, itemIndex) => `${itemIndex + 1}. ${item.trim()}`)
      .join('\n');
  }

  if (node.type === 'listItem') {
    return content.join('\n').trim();
  }

  if (node.type === 'paragraph') {
    return content.join('');
  }

  return content.join(index > 0 ? '\n' : '');
}

export function richTextToMarkdown(
  value: RichTextDocument | undefined
): string {
  if (!value) return '';
  return value.content
    .map((node, index) => richTextNodeToMarkdown(node, index))
    .filter((content) => content.trim() !== '')
    .join('\n')
    .trim();
}

function compactHeaderContent(content: HeaderContent): HeaderContent {
  return {
    name: content.name,
    title: content.title,
    email: content.email,
    phone: content.phone,
    location: content.location,
    linkedin: content.linkedin,
    github: content.github,
    website: content.website,
  };
}

function compactResumeImage(image: ResumeImage): Record<string, string> {
  return {
    id: image.id,
    src: image.src,
    path: image.path ?? '',
    alt: image.alt,
    caption: image.caption ?? '',
  };
}

function compactExperienceProject(
  project: ExperienceProject
): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    startDate: project.startDate ?? '',
    endDate: project.endDate ?? '',
    tech: project.tech ?? '',
    images: project.images?.map(compactResumeImage) ?? [],
    problem: richTextToMarkdown(project.problem),
    ownership: richTextToMarkdown(project.ownership),
    achievement: richTextToMarkdown(project.achievement),
  };
}

function compactExperienceItem(item: ExperienceItem): Record<string, unknown> {
  return {
    id: item.id,
    company: item.company,
    role: item.role,
    location: item.location,
    startDate: item.startDate,
    endDate: item.endDate,
    images: item.images?.map(compactResumeImage) ?? [],
    projects: item.projects?.map(compactExperienceProject) ?? [],
    tech: item.tech ?? '',
    problem: richTextToMarkdown(item.problem),
    ownership: richTextToMarkdown(item.ownership),
    achievement: richTextToMarkdown(item.achievement),
    description: richTextToMarkdown(item.description),
  };
}

function compactEducationAdditionalMajor(
  major: EducationAdditionalMajor
): EducationAdditionalMajor {
  return {
    id: major.id,
    label: major.label,
    field: major.field,
  };
}

function compactEducationItem(item: EducationItem): Record<string, unknown> {
  return {
    id: item.id,
    schoolType: item.schoolType,
    school: item.school,
    degree: item.degree ?? '',
    field: item.field ?? '',
    additionalMajors:
      item.additionalMajors?.map(compactEducationAdditionalMajor) ?? [],
    highSchoolCategory: item.highSchoolCategory ?? '',
    startDate: item.startDate,
    endDate: item.endDate,
    gpa: item.gpa ?? '',
    gpaScale: item.gpaScale ?? '4.5',
  };
}

function compactSkillCategory(category: SkillCategory): SkillCategory {
  return {
    id: category.id,
    name: category.name,
    skills: category.skills,
  };
}

function compactProjectItem(item: ProjectItem): Record<string, unknown> {
  return {
    id: item.id,
    name: item.name,
    description: richTextToMarkdown(item.description),
    tech: item.tech,
    link: item.link ?? '',
    images: item.images?.map(compactResumeImage) ?? [],
  };
}

export function compactSectionContent(
  sectionType: SectionType,
  content: SectionContent
): unknown {
  const normalized = normalizeSectionContent(sectionType, content);

  if (sectionType === 'header') {
    return compactHeaderContent(normalized as HeaderContent);
  }

  if (sectionType === 'summary' || sectionType === 'text') {
    const richTextContent = normalized as SummaryContent | TextContent;
    return { text: richTextToMarkdown(richTextContent.text) };
  }

  if (sectionType === 'experience') {
    const experienceContent = normalized as ExperienceContent;
    return { items: experienceContent.items.map(compactExperienceItem) };
  }

  if (sectionType === 'education') {
    const educationContent = normalized as EducationContent;
    return { items: educationContent.items.map(compactEducationItem) };
  }

  if (sectionType === 'skills') {
    const skillsContent = normalized as SkillsContent;
    return {
      categories: skillsContent.categories.map(compactSkillCategory),
    };
  }

  const projectsContent = normalized as ProjectsContent;
  return { items: projectsContent.items.map(compactProjectItem) };
}
