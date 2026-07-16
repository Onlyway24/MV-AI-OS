import { createHash } from "node:crypto";

import {
  METODO_VELOCE_CONTENT_PRODUCTION_CONTRACT_VERSION,
  type ContentEvidence,
  type MetodoVeloceContentProductionBrief,
  type MetodoVeloceContentProductionPackage,
} from "./metodo-veloce-content-production.js";
import type {
  MetodoVeloceContentProductionArchiveRequest,
  MetodoVeloceContentProductionMetricsRequest,
  MetodoVeloceContentProductionRecord,
  MetodoVeloceContentProductionReviewRequest,
  MetodoVeloceContentProductionScheduleRequest,
} from "./metodo-veloce-content-production-record.js";
import type { ValidationResult, Validator } from "../validation/validation.js";
import { validationFailure, validationSuccess } from "../validation/validation.js";
import { QualityGuardianReportValidator } from "../guardians/quality-guardian-validator.js";
import { SocialPublishingPackValidator } from "../social-intelligence/metodo-veloce-social-intelligence-validator.js";

const ID = /^[a-z0-9][a-z0-9@._-]{0,127}$/u;
const UNSAFE = /(?:\bsk-[A-Za-z0-9_-]{8,}|https?:\/\/|secret|token|raw prompt|raw completion|provider payload|stack trace|password)/iu;
const CLAIM = /(?:guaranteed|garantit[oaie]?|make\s+€?\d+|guadagn\w+\s+(?:sicuro|garantit)|cura|dimagrisci|senza pagare tasse|best in the world|migliore del mondo)/iu;
const QUALITY_REPORT = new QualityGuardianReportValidator();
const SOCIAL_PUBLISHING_PACK = new SocialPublishingPackValidator();

export class MetodoVeloceContentProductionBriefValidator implements Validator<MetodoVeloceContentProductionBrief> {
  public validate(value: unknown): ValidationResult<MetodoVeloceContentProductionBrief> {
    if (!record(value) || !keys(value, ["audience", "callToAction", "contractVersion", "evidence", "language", "missionReference", "objective", "offer", "productionId", "topic"]) || value.contractVersion !== METODO_VELOCE_CONTENT_PRODUCTION_CONTRACT_VERSION || value.language !== "it" || !identifier(value.productionId) || !identifier(value.missionReference) || !text(value.topic, 12, 240) || !text(value.audience, 4, 240) || !text(value.offer, 4, 240) || !text(value.callToAction, 4, 180) || !["educate", "engage", "lead_generation", "soft_sell"].includes(value.objective as string) || !evidence(value.evidence)) return invalid("Metodo Veloce content production brief is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as MetodoVeloceContentProductionBrief)));
  }
}

export class MetodoVeloceContentProductionPackageValidator implements Validator<MetodoVeloceContentProductionPackage> {
  public validate(value: unknown): ValidationResult<MetodoVeloceContentProductionPackage> {
    if (!record(value)) return invalid("Metodo Veloce content production package is invalid");
    const fields = ["approval", "contractVersion", "editorialPlan", "evidence", "externalActionsAllowed", "generatedAt", "metrics", "missionReference", "productionId", "quality", "risk", "status", "version", ...(value.assets === undefined ? [] : ["assets"]), ...(value.socialPublishingPack === undefined ? [] : ["socialPublishingPack"])];
    const approvalStatus = record(value.approval) ? value.approval.status : undefined;
    const riskStatus = record(value.risk) ? value.risk.status : undefined;
    if (!keys(value, fields) || value.contractVersion !== METODO_VELOCE_CONTENT_PRODUCTION_CONTRACT_VERSION || value.version !== 1 || value.externalActionsAllowed !== false || !identifier(value.productionId) || !identifier(value.missionReference) || !timestamp(value.generatedAt) || !approval(value.approval) || !editorial(value.editorialPlan) || !evidenceSummary(value.evidence) || !quality(value.quality) || !risk(value.risk) || !metrics(value.metrics) || (value.socialPublishingPack !== undefined && !socialPublishingPack(value.socialPublishingPack)) || !["BLOCKED", "READY_FOR_FABIO_APPROVAL"].includes(value.status as string) || (value.status === "BLOCKED" && (value.assets !== undefined || approvalStatus !== "NOT_ELIGIBLE" || riskStatus !== "BLOCKED")) || (value.status === "READY_FOR_FABIO_APPROVAL" && (!assets(value.assets) || approvalStatus !== "PENDING_FABIO" || riskStatus !== "CLEAR")) || (record(value.socialPublishingPack) && value.socialPublishingPack.productionId !== value.productionId)) return invalid("Metodo Veloce content production package is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as MetodoVeloceContentProductionPackage)));
  }
}

const PACKAGE = new MetodoVeloceContentProductionPackageValidator();

export class MetodoVeloceContentProductionRecordValidator implements Validator<MetodoVeloceContentProductionRecord> {
  public validate(value: unknown): ValidationResult<MetodoVeloceContentProductionRecord> {
    if (!record(value)) return invalid("Metodo Veloce content production record is invalid");
    const fields = ["actorId", "contractVersion", "createdAt", "package", "productionId", "status", "updatedAt", "version", "workspaceId", ...(value.archive === undefined ? [] : ["archive"]), ...(value.evidencePack === undefined ? [] : ["evidencePack"]), ...(value.metrics === undefined ? [] : ["metrics"]), ...(value.review === undefined ? [] : ["review"]), ...(value.schedule === undefined ? [] : ["schedule"])];
    if (!keys(value, fields) || !identifier(value.actorId) || !identifier(value.workspaceId) || !identifier(value.productionId) || value.contractVersion !== METODO_VELOCE_CONTENT_PRODUCTION_CONTRACT_VERSION || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || !version(value.version) || !evidencePack(value.evidencePack) || !PACKAGE.validate(value.package).ok || !recordStatus(value)) return invalid("Metodo Veloce content production record is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as MetodoVeloceContentProductionRecord)));
  }
}

export class MetodoVeloceContentProductionReviewRequestValidator implements Validator<MetodoVeloceContentProductionReviewRequest> {
  public validate(value: unknown): ValidationResult<MetodoVeloceContentProductionReviewRequest> { return request(value, ["decision", "expectedVersion", "note", "productionId"], (candidate) => identifier(candidate.productionId) && version(candidate.expectedVersion) && ["APPROVED", "REJECTED"].includes(candidate.decision as string) && text(candidate.note, 4, 600), "Metodo Veloce content review request"); }
}

export class MetodoVeloceContentProductionScheduleRequestValidator implements Validator<MetodoVeloceContentProductionScheduleRequest> {
  public validate(value: unknown): ValidationResult<MetodoVeloceContentProductionScheduleRequest> { return request(value, ["expectedVersion", "productionId", "scheduledFor"], (candidate) => identifier(candidate.productionId) && version(candidate.expectedVersion) && timestamp(candidate.scheduledFor), "Metodo Veloce content schedule request"); }
}

export class MetodoVeloceContentProductionMetricsRequestValidator implements Validator<MetodoVeloceContentProductionMetricsRequest> {
  public validate(value: unknown): ValidationResult<MetodoVeloceContentProductionMetricsRequest> { return request(value, ["conversions", "costCents", "expectedVersion", "leadCount", "productionId", "saves", "views"], (candidate) => identifier(candidate.productionId) && version(candidate.expectedVersion) && nonNegative(candidate.views) && nonNegative(candidate.saves) && nonNegative(candidate.leadCount) && nonNegative(candidate.conversions) && nonNegative(candidate.costCents), "Metodo Veloce content metrics request"); }
}

export class MetodoVeloceContentProductionArchiveRequestValidator implements Validator<MetodoVeloceContentProductionArchiveRequest> {
  public validate(value: unknown): ValidationResult<MetodoVeloceContentProductionArchiveRequest> { return request(value, ["expectedVersion", "productionId", "reason"], (candidate) => identifier(candidate.productionId) && version(candidate.expectedVersion) && candidate.reason === "MANUAL", "Metodo Veloce content archive request"); }
}

function evidence(value: unknown): value is readonly ContentEvidence[] { return Array.isArray(value) && value.length >= 1 && value.length <= 8 && value.every((entry) => record(entry) && keys(entry, ["evidenceId", "sourceRef", "statement"]) && identifier(entry.evidenceId) && identifier(entry.sourceRef) && text(entry.statement, 8, 500)); }
function evidencePack(value: unknown): boolean { return value === undefined || (record(value) && keys(value, ["fingerprint", "minFreshnessExpiresAt", "packId", "verifiedAt"]) && identifier(value.packId) && typeof value.fingerprint === "string" && /^[a-f0-9]{64}$/u.test(value.fingerprint) && timestamp(value.minFreshnessExpiresAt) && timestamp(value.verifiedAt) && Date.parse(value.verifiedAt) < Date.parse(value.minFreshnessExpiresAt)); }
function evidenceSummary(value: unknown): boolean { return record(value) && keys(value, ["items", "limitations"]) && evidence(value.items) && strings(value.limitations, 1, 4, 300); }
function socialPublishingPack(value: unknown): boolean {
  if (SOCIAL_PUBLISHING_PACK.validate(value).ok) return true;
  if (!record(value) || value.contractVersion !== "1" || value.externalActionsAllowed !== false || !identifier(value.productionId) || !timestamp(value.generatedAt) || !["BLOCKED", "REQUIRES_RESEARCH"].includes(String(value.status)) || !["RICHIEDE_RICERCA", "SCARTARE"].includes(String(value.decision)) || typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(value.fingerprint)) return false;
  const legacyFields = ["abTest", "audienceDemand", "audioPlan", "blockingReasons", "brandDistinctiveness", "carousel", "competitorGap", "contractVersion", "conversionIntent", "culturalRisk", "decision", "externalActionsAllowed", "fatigue", "fingerprint", "generatedAt", "hashtagSets", "measurement", "opportunity", "portfolioRole", "productionId", "publicationWindows", "sequence", "socialSeo", "status", "trendAnalysis", "visualDirection"];
  if (!keys(value, legacyFields)) return false;
  const payload = structuredClone(value);
  delete payload.fingerprint;
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex") === value.fingerprint;
}
function approval(value: unknown): boolean { return record(value) && keys(value, ["required", "status"]) && value.required === true && ["NOT_ELIGIBLE", "PENDING_FABIO"].includes(value.status as string); }
function editorial(value: unknown): boolean { return record(value) && keys(value, ["angle", "audience", "objective", "selectedIdea"]) && text(value.angle, 8, 500) && text(value.audience, 4, 240) && ["educate", "engage", "lead_generation", "soft_sell"].includes(value.objective as string) && text(value.selectedIdea, 8, 500); }
function quality(value: unknown): boolean { return record(value) && keys(value, ["readinessScore", "report"]) && score(value.readinessScore) && QUALITY_REPORT.validate(value.report).ok; }
function risk(value: unknown): boolean { return record(value) && keys(value, ["findings", "status"]) && ["BLOCKED", "CLEAR"].includes(value.status as string) && strings(value.findings, 0, 8, 500); }
function metrics(value: unknown): boolean { return record(value) && keys(value, ["measures", "reviewCadence"]) && value.reviewCadence === "weekly" && strings(value.measures, 6, 12, 120); }
function assets(value: unknown): boolean { return record(value) && keys(value, ["carousel", "instagram", "tiktok", "variants"]) && carousel(value.carousel) && instagram(value.instagram) && tiktok(value.tiktok) && variants(value.variants); }
function carousel(value: unknown): boolean { return Array.isArray(value) && value.length === 6 && value.every((slide, index) => record(slide) && keys(slide, ["body", "slide", "title"]) && slide.slide === index + 1 && text(slide.title, 3, 100) && text(slide.body, 4, 500)); }
function instagram(value: unknown): boolean { return record(value) && keys(value, ["caption", "firstLine", "hashtags"]) && text(value.firstLine, 4, 180) && text(value.caption, 20, 2_000) && strings(value.hashtags, 5, 12, 80); }
function tiktok(value: unknown): boolean { return record(value) && keys(value, ["beats", "caption", "durationSeconds", "hook"]) && value.durationSeconds === 35 && text(value.hook, 4, 180) && text(value.caption, 10, 800) && Array.isArray(value.beats) && value.beats.length === 5 && value.beats.every((beat, index) => record(beat) && keys(beat, ["beat", "onScreenText", "spokenText"]) && beat.beat === index + 1 && text(beat.onScreenText, 3, 100) && text(beat.spokenText, 4, 500)); }
function variants(value: unknown): boolean { return record(value) && keys(value, ["instagramOpeners", "tiktokHooks"]) && strings(value.instagramOpeners, 3, 3, 180) && strings(value.tiktokHooks, 3, 3, 180); }
function strings(value: unknown, min: number, max: number, length: number): boolean { return Array.isArray(value) && value.length >= min && value.length <= max && value.every((entry) => text(entry, 1, length)); }
function score(value: unknown): boolean { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 100; }
function identifier(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function text(value: unknown, min: number, max: number): value is string { return typeof value === "string" && value.trim().length >= min && value.trim().length <= max && !UNSAFE.test(value); }
function timestamp(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value); }
function version(value: unknown): boolean { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000; }
function nonNegative(value: unknown): boolean { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000_000; }
function request<T>(value: unknown, expected: readonly string[], valid: (candidate: Record<string, unknown>) => boolean, message: string): ValidationResult<T> { if (!record(value) || !keys(value, expected) || !valid(value)) return invalid(message); return validationSuccess(freeze(structuredClone(value as unknown as T))); }
function recordStatus(value: Record<string, unknown>): boolean {
  const packageValue = value.package as MetodoVeloceContentProductionPackage;
  const status = value.status;
  const reviewValue = value.review;
  const scheduleValue = value.schedule;
  const metricsValue = value.metrics;
  const archiveValue = value.archive;
  if (!["APPROVED_FOR_SCHEDULING", "ARCHIVED", "BLOCKED", "PENDING_FABIO_APPROVAL", "SCHEDULED"].includes(status as string)) return false;
  if (reviewValue !== undefined && (!record(reviewValue) || !keys(reviewValue, ["decision", "note", "reviewedAt", "reviewedBy"]) || !["APPROVED", "REJECTED"].includes(reviewValue.decision as string) || !text(reviewValue.note, 4, 600) || !timestamp(reviewValue.reviewedAt) || !identifier(reviewValue.reviewedBy))) return false;
  if (scheduleValue !== undefined && (!record(scheduleValue) || !keys(scheduleValue, ["scheduledFor"]) || !timestamp(scheduleValue.scheduledFor))) return false;
  if (metricsValue !== undefined && (!record(metricsValue) || !keys(metricsValue, ["conversions", "costCents", "leadCount", "reportedAt", "reportedBy", "saves", "views"]) || !nonNegative(metricsValue.views) || !nonNegative(metricsValue.saves) || !nonNegative(metricsValue.leadCount) || !nonNegative(metricsValue.conversions) || !nonNegative(metricsValue.costCents) || !timestamp(metricsValue.reportedAt) || !identifier(metricsValue.reportedBy))) return false;
  if (archiveValue !== undefined && (!record(archiveValue) || !keys(archiveValue, ["archivedAt", "reason"]) || !timestamp(archiveValue.archivedAt) || !["MANUAL", "REJECTED_BY_FABIO"].includes(archiveValue.reason as string))) return false;
  if (status === "BLOCKED") return packageValue.status === "BLOCKED" && reviewValue === undefined && scheduleValue === undefined && metricsValue === undefined && archiveValue === undefined;
  if (status === "PENDING_FABIO_APPROVAL") return packageValue.status === "READY_FOR_FABIO_APPROVAL" && reviewValue === undefined && scheduleValue === undefined && metricsValue === undefined && archiveValue === undefined;
  if (status === "APPROVED_FOR_SCHEDULING") return packageValue.status === "READY_FOR_FABIO_APPROVAL" && record(reviewValue) && reviewValue.decision === "APPROVED" && scheduleValue === undefined && metricsValue === undefined && archiveValue === undefined;
  if (status === "SCHEDULED") return packageValue.status === "READY_FOR_FABIO_APPROVAL" && record(reviewValue) && reviewValue.decision === "APPROVED" && scheduleValue !== undefined && archiveValue === undefined;
  return packageValue.status === "READY_FOR_FABIO_APPROVAL" && record(archiveValue) && ((archiveValue.reason === "REJECTED_BY_FABIO" && record(reviewValue) && reviewValue.decision === "REJECTED" && scheduleValue === undefined && metricsValue === undefined) || (archiveValue.reason === "MANUAL" && (!record(reviewValue) || reviewValue.decision === "APPROVED")));
}
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean { const actual = Object.keys(value).sort(); const sorted = [...expected].sort(); return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }

export function contentClaimRisk(value: string): boolean { return CLAIM.test(value); }
