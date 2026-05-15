import { notFound, validationError } from "../../../../../common/application-error";
import {
  requireCatalogSuggestionStatus,
  toClientCatalogSuggestionStatus,
} from "../../domain/admin-catalog-suggestions.helpers";
import type { AdminCatalogSuggestionsRepository } from "../../infrastructure/repositories/admin-catalog-suggestions.repository";

export class AdminCatalogSuggestionsService {
  constructor(private readonly repository: AdminCatalogSuggestionsRepository) {}

  async approveReference(publicId: string, actorUserId: number, body: Record<string, unknown>) {
    const result = await this.repository.approveReference({ publicId, actorUserId, body });
    return {
      success: true,
      suggestionStatus: toClientCatalogSuggestionStatus(result.updated.status),
      item: { id: result.item.public_id, name: result.item.name },
      brand: { id: result.brand.public_id, name: result.brand.name },
      model: { id: result.model.public_id, name: result.model.name },
      product: { id: result.product.public_id, title: result.product.title },
    };
  }

  async listSuggestions() {
    const suggestions = await this.repository.listSuggestions();
    return suggestions.map((suggestion) => ({
      id: suggestion.public_id,
      entityType: suggestion.entity_type.toLowerCase(),
      status: toClientCatalogSuggestionStatus(suggestion.status),
      type: suggestion.type.toLowerCase(),
      rawValue: suggestion.raw_value,
      normalizedValue: suggestion.normalized_value,
      reason: suggestion.reason,
      payload: suggestion.payload,
      adminNote: suggestion.admin_note,
      usageCount: suggestion.usage_count,
      mergedTargetPublicId: suggestion.merged_target_public_id,
      createdAt: suggestion.created_at,
      reviewedAt: suggestion.reviewed_at,
      category: suggestion.category
        ? {
            id: suggestion.category.public_id,
            name: suggestion.category.name,
            type: suggestion.category.type.toLowerCase(),
          }
        : null,
      subcategory: suggestion.subcategory
        ? {
            id: suggestion.subcategory.public_id,
            name: suggestion.subcategory.name,
          }
        : null,
      item: suggestion.item
        ? { id: suggestion.item.public_id, name: suggestion.item.name }
        : null,
      proposedBy: suggestion.proposed_by
        ? {
            id: suggestion.proposed_by.public_id,
            name: suggestion.proposed_by.name,
            email: suggestion.proposed_by.email,
          }
        : null,
    }));
  }

  async updateSuggestion(publicId: string, actorUserId: number, body: Record<string, unknown>) {
    const nextStatus = requireCatalogSuggestionStatus(body.status);
    const adminNote = typeof body.adminNote === "string" ? body.adminNote.trim() : "";
    const mergedTargetPublicId =
      typeof body.mergedTargetPublicId === "string"
        ? body.mergedTargetPublicId.trim()
        : "";
    const approval =
      body.approval && typeof body.approval === "object"
        ? (body.approval as Record<string, unknown>)
        : {};

    if (nextStatus === "REJECTED" && adminNote.length < 3) {
      throw validationError("Укажите причину отклонения");
    }

    const existing = await this.repository.findSuggestionByPublicId(publicId);
    if (!existing) {
      throw notFound("Catalog suggestion not found");
    }

    const result = await this.repository.updateSuggestion({
      existing,
      nextStatus,
      adminNote,
      mergedTargetPublicId,
      approval,
      actorUserId,
    });

    return {
      success: true,
      status: toClientCatalogSuggestionStatus(result.updated.status),
      createdItem: result.createdCatalogEntity,
    };
  }
}
