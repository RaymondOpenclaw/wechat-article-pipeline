/**
 * Shared object shapes used across the core engine, CLI, Web UI, tests, and the future skill.
 * These JSDoc typedefs keep the project dependency-free while giving editors useful hints.
 */

/**
 * @typedef {Object} ArticleInput
 * @property {string=} sourcePath
 * @property {string} rawText
 * @property {Record<string, any>} metadata
 */

/**
 * @typedef {Object} ArticleBlueprint
 * @property {string} coreClaim
 * @property {string} audience
 * @property {string} articleType
 * @property {string[]} titleCandidates
 * @property {string} digest
 * @property {{heading: string, role: string, summary: string}[]} sections
 * @property {string} closingPrompt
 */

/**
 * @typedef {Object} ContentBrief
 * @property {string} coreClaim
 * @property {string[]} intendedReaders
 * @property {string} contentType
 * @property {number} completenessScore
 * @property {{area: string, gap: string, whyItMatters: string, howToFill: string}[]} missingInfo
 * @property {{type: string, content: string, usage: string}[]} safeSupplements
 * @property {string[]} needsUserInput
 * @property {string[]} factualBoundaries
 * @property {{heading: string, purpose: string, keyPoints: string[]}[]} suggestedOutline
 * @property {string} writingFocus
 * @property {string} completionPrompt
 */

/**
 * @typedef {Object} StyleProfile
 * @property {string} profileName
 * @property {number} articleCount
 * @property {string[]} titlePatterns
 * @property {string[]} openingPatterns
 * @property {string} paragraphRhythm
 * @property {string[]} signaturePhrases
 * @property {string[]} argumentStyles
 * @property {string[]} closingPatterns
 * @property {string[]} bannedExpressions
 * @property {string} visualStyle
 * @property {string[]} sourceUrls
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} VisualBrief
 * @property {string} theme
 * @property {string} mood
 * @property {string[]} keywords
 * @property {string} coverPrompt
 * @property {string[]} inlinePrompts
 * @property {string[]} forbiddenElements
 * @property {string} style
 */

/**
 * @typedef {Object} GeneratedImage
 * @property {"cover"|"inline"} kind
 * @property {string} prompt
 * @property {string} localPath
 * @property {string=} generator
 * @property {string=} wechatUrl
 * @property {string=} mediaId
 */

/**
 * @typedef {Object} ProcessedArticle
 * @property {ArticleInput} input
 * @property {ArticleBlueprint} blueprint
 * @property {StyleProfile|null} styleProfile
 * @property {ContentBrief|null} contentBrief
 * @property {Object|null} expertReviews
 * @property {VisualBrief} visualBrief
 * @property {string} title
 * @property {string} digest
 * @property {string} html
 * @property {string} markdown
 * @property {string[]} changeLog
 * @property {string[]} riskNotes
 * @property {GeneratedImage[]} images
 * @property {string} createdAt
 */

export {};
