import { logger } from "../../../../lib/logger";
import { Router } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { requireAdmin } from "../../common/http/admin-session";
import type { AdminCatalogService } from "../application/services/admin-catalog.service";

export function createAdminCatalogRouter(deps: {
  service: AdminCatalogService;
}) {
  const router = Router();

  router.get("/catalog", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.getCatalog(req.query.type));
    } catch (error) {
      logger.error("error_fetching_admin_catalog", { error });
      sendApplicationError(res, error);
    }
  });

  router.get("/catalog/search", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.searchCatalog((req.query ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_searching_admin_catalog", { error });
      sendApplicationError(res, error);
    }
  });

  router.patch("/catalog/reorder", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.reorderCatalog((req.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_reordering_catalog", { error });
      sendApplicationError(res, error);
    }
  });

  router.post("/catalog/categories", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.status(201).json(await deps.service.createCategory((req.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_creating_catalog_category", { error });
      sendApplicationError(res, error);
    }
  });

  router.patch("/catalog/categories/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.updateCategory(String(req.params.publicId ?? ""), (req.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_updating_catalog_category", { error });
      sendApplicationError(res, error);
    }
  });

  router.delete("/catalog/categories/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.deleteCategory(String(req.params.publicId ?? "")));
    } catch (error) {
      logger.error("error_deleting_catalog_category", { error });
      sendApplicationError(res, error);
    }
  });

  router.post("/catalog/subcategories", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.status(201).json(await deps.service.createSubcategory((req.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_creating_catalog_subcategory", { error });
      sendApplicationError(res, error);
    }
  });

  router.patch("/catalog/subcategories/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.updateSubcategory(String(req.params.publicId ?? ""), (req.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_updating_catalog_subcategory", { error });
      sendApplicationError(res, error);
    }
  });

  router.delete("/catalog/subcategories/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.deleteSubcategory(String(req.params.publicId ?? "")));
    } catch (error) {
      logger.error("error_deleting_catalog_subcategory", { error });
      sendApplicationError(res, error);
    }
  });

  router.post("/catalog/items", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.status(201).json(await deps.service.createItem((req.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_creating_catalog_item", { error });
      sendApplicationError(res, error);
    }
  });

  router.patch("/catalog/items/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.updateItem(String(req.params.publicId ?? ""), (req.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_updating_catalog_item", { error });
      sendApplicationError(res, error);
    }
  });

  router.delete("/catalog/items/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.deleteItem(String(req.params.publicId ?? "")));
    } catch (error) {
      logger.error("error_deleting_catalog_item", { error });
      sendApplicationError(res, error);
    }
  });

  router.get("/catalog/items/:publicId/reference", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.getItemReference(String(req.params.publicId ?? "")));
    } catch (error) {
      logger.error("error_fetching_catalog_item_reference", { error });
      sendApplicationError(res, error);
    }
  });

  router.post("/catalog/items/:publicId/reference/brands", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.status(201).json(await deps.service.createBrand(String(req.params.publicId ?? ""), (req.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_creating_catalog_reference_brand", { error });
      sendApplicationError(res, error);
    }
  });

  router.patch("/catalog/reference/brands/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.updateBrand(String(req.params.publicId ?? ""), (req.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_updating_catalog_reference_brand", { error });
      sendApplicationError(res, error);
    }
  });

  router.delete("/catalog/reference/brands/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.deleteBrand(String(req.params.publicId ?? "")));
    } catch (error) {
      logger.error("error_deleting_catalog_reference_brand", { error });
      sendApplicationError(res, error);
    }
  });

  router.post("/catalog/reference/brands/:publicId/models", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.status(201).json(await deps.service.createModel(String(req.params.publicId ?? ""), (req.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_creating_catalog_reference_model", { error });
      sendApplicationError(res, error);
    }
  });

  router.patch("/catalog/reference/models/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.updateModel(String(req.params.publicId ?? ""), (req.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_updating_catalog_reference_model", { error });
      sendApplicationError(res, error);
    }
  });

  router.delete("/catalog/reference/models/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.deleteModel(String(req.params.publicId ?? "")));
    } catch (error) {
      logger.error("error_deleting_catalog_reference_model", { error });
      sendApplicationError(res, error);
    }
  });

  router.post("/catalog/reference/models/:publicId/products", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.status(201).json(await deps.service.createProduct(String(req.params.publicId ?? ""), (req.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_creating_catalog_reference_product", { error });
      sendApplicationError(res, error);
    }
  });

  router.patch("/catalog/reference/products/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.updateProduct(String(req.params.publicId ?? ""), (req.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_updating_catalog_reference_product", { error });
      sendApplicationError(res, error);
    }
  });

  router.delete("/catalog/reference/characteristics/:id", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.deleteCharacteristic(String(req.params.id ?? "")));
    } catch (error) {
      logger.error("error_deleting_catalog_reference_characteristic", { error });
      sendApplicationError(res, error);
    }
  });

  router.delete("/catalog/reference/products/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.deleteProduct(String(req.params.publicId ?? "")));
    } catch (error) {
      logger.error("error_deleting_catalog_reference_product", { error });
      sendApplicationError(res, error);
    }
  });

  return router;
}
