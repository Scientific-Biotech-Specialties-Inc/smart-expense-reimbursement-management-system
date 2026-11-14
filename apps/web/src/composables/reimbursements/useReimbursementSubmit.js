import { ref } from "vue";
import { useToast } from "@/composables/useToast";
import { useReimbursementStore } from "@/stores/reimbursement";
import { cleanName } from "@/utils/receiptUtils";
import { validateTemplateData } from "@/utils/sbsiReportTemplateUtils";
import { createSbsiReportPdfFile } from "@/utils/sbsiPdfGenerator";

export function useReimbursementSubmit(emit, router) {
  const store = useReimbursementStore();
  const { addToast } = useToast();
  
  const submitting = ref(false);

  /**
   * Serializes receipt metadata and line items into a multipart FormData payload.
   *
   * @param {FormData} formData
   * @param {Array<object>} receipts
   */
  function appendReceiptsToFormData(formData, receipts) {
    receipts.forEach((r, index) => {
      formData.append(`receipt_ids[${index}]`, r.id);
      formData.append(`receipts[${index}][id]`, r.id);
      if (r.categoryId) {
        formData.append(`receipts[${index}][expense_category_id]`, r.categoryId);
      }
      if (r.eventType) {
        formData.append(`receipts[${index}][event_type]`, r.eventType);
      }
      formData.append(`receipts[${index}][vendor_name]`, r.merchantName || "");
      formData.append(`receipts[${index}][transaction_date]`, r.date || "");
      formData.append(`receipts[${index}][total_amount]`, r.amount || 0);
      formData.append(`receipts[${index}][vat_amount]`, r.tax || 0);
      formData.append(
        `receipts[${index}][vat_classification]`,
        r.vatClassification || "vat",
      );
      if (r.currency) {
        formData.append(`receipts[${index}][currency]`, r.currency);
      }
      formData.append(`receipts[${index}][tin]`, r.tin || "");
      formData.append(
        `receipts[${index}][invoice_number]`,
        r.invoiceNumber || "",
      );

      if (r.items && Array.isArray(r.items)) {
        r.items.forEach((item, itemIdx) => {
          formData.append(
            `receipts[${index}][items][${itemIdx}][name]`,
            item.name || "",
          );
          formData.append(
            `receipts[${index}][items][${itemIdx}][quantity]`,
            item.qty || 1,
          );
          formData.append(
            `receipts[${index}][items][${itemIdx}][price]`,
            item.price || 0,
          );
        });
      }
    });
  }

  function resolveReportAttachment({ reportFile, reportTemplateData }) {
    const isTemplateMode = Boolean(reportTemplateData && reportTemplateData.mode !== "manual");
    if (!isTemplateMode) {
      return {
        file: reportFile instanceof File ? reportFile : null,
        templateJson: reportTemplateData?.mode === "manual" ? JSON.stringify({ mode: "manual" }) : null,
      };
    }

    const validation = validateTemplateData(reportTemplateData);
    if (!validation.valid) {
      addToast({
        message: validation.errors[0] || "Please complete all required report template fields.",
        type: "error",
      });
      return null;
    }

    try {
      const generatedFile = createSbsiReportPdfFile(reportTemplateData);
      return {
        file: generatedFile,
        templateJson: JSON.stringify(reportTemplateData),
      };
    } catch (error) {
      console.error("Reimbursement report PDF generation failed:", error);
      addToast({
        message: "Failed to generate the report PDF. Please review the report template and try again.",
        type: "error",
      });
      return null;
    }
  }

  async function submitReimbursement({ receipts, reportFile, reportTemplateData = null, totalAmount, userComment }) {
    if (submitting.value) return false;
    const isTemplateMode = Boolean(reportTemplateData && reportTemplateData.mode !== "manual");
    if (!receipts.length || (!isTemplateMode && !reportFile) || receipts.some(r => r.isUploading)) {
      return false;
    }
    if (receipts.some((r) => !r.categoryId)) {
      addToast({
        message: "Category is required for every receipt.",
        type: "error",
      });
      return false;
    }
    if (receipts.some((r) => !r.eventType)) {
      addToast({
        message: "Type of event is required for every receipt.",
        type: "error",
      });
      return false;
    }

    for (let idx = 0; idx < receipts.length; idx++) {
      const r = receipts[idx];
      if (!r.id || String(r.id).startsWith("temp-")) {
        addToast({
          message: `Receipt ${idx + 1} has not finished uploading or failed to upload. Please re-upload.`,
          type: "error",
        });
        return false;
      }
      if (!r.date) {
        addToast({
          message: `Date is required for receipt ${idx + 1}`,
          type: "error",
        });
        return false;
      }
      if (r.items && Array.isArray(r.items)) {
        for (const item of r.items) {
          if (!item.name || !item.name.trim()) {
            addToast({
              message: `Item name is required in receipt ${idx + 1}`,
              type: "error",
            });
            return false;
          }
          if (Number(item.qty) <= 0) {
            addToast({
              message: `Quantity for "${item.name}" must be greater than 0`,
              type: "error",
            });
            return false;
          }
          if (Number(item.price) <= 0) {
            addToast({
              message: `Price for "${item.name}" must be greater than 0`,
              type: "error",
            });
            return false;
          }
        }
      }
    }

    const attachment = resolveReportAttachment({ reportFile, reportTemplateData });
    if (!attachment) return false;

    submitting.value = true;
    try {
      const formData = new FormData();
      formData.append(
        "description",
        receipts
          .map((r) => r.merchantName || cleanName(r.fileName))
          .join(", "),
      );
      if (userComment) {
        formData.append("user_comment", userComment);
      }
      formData.append("expense_category_id", receipts[0].categoryId);
      if (receipts[0]?.eventType) {
        formData.append("event_type", receipts[0].eventType);
      }
      formData.append("amount", totalAmount);
      formData.append(
        "date",
        receipts[0]?.date || new Date().toISOString().slice(0, 10),
      );

      if (attachment.file) {
        formData.append("report_file", attachment.file);
      }
      if (attachment.templateJson) {
        formData.append("report_template_data", attachment.templateJson);
      }

      appendReceiptsToFormData(formData, receipts);

      await store.submit(formData);

      addToast({
        message: "Reimbursement submitted successfully!",
        type: "success",
      });
      emit("submitted");
      
      emit("close");
      router.push({ name: "Reimbursements" });
      
      return true;
    } finally {
      submitting.value = false;
    }
  }

  async function updateReimbursement(id, { receipts, reportFile, reportTemplateData = null, totalAmount, userComment }) {
    if (submitting.value) return false;
    if (!receipts.length || receipts.some(r => r.isUploading)) {
      return false;
    }

    for (let idx = 0; idx < receipts.length; idx++) {
      const r = receipts[idx];
      if (!r.date) {
        addToast({
          message: `Date is required for receipt ${idx + 1}`,
          type: "error",
        });
        return false;
      }
      if (r.items && Array.isArray(r.items)) {
        for (const item of r.items) {
          if (!item.name || !item.name.trim()) {
            addToast({
              message: `Item name is required in receipt ${idx + 1}`,
              type: "error",
            });
            return false;
          }
          if (Number(item.qty) <= 0) {
            addToast({
              message: `Quantity for "${item.name}" must be greater than 0`,
              type: "error",
            });
            return false;
          }
          if (Number(item.price) <= 0) {
            addToast({
              message: `Price for "${item.name}" must be greater than 0`,
              type: "error",
            });
            return false;
          }
        }
      }
    }

    const attachment = resolveReportAttachment({ reportFile, reportTemplateData });
    if (!attachment) return false;

    submitting.value = true;
    try {
      const formData = new FormData();
      formData.append(
        "description",
        receipts
          .map((r) => r.merchantName || cleanName(r.fileName))
          .join(", "),
      );
      if (userComment !== undefined) {
        formData.append("user_comment", userComment || "");
      }
      if (receipts[0].categoryId) {
        formData.append("expense_category_id", receipts[0].categoryId);
      }
      if (receipts[0]?.eventType) {
        formData.append("event_type", receipts[0].eventType);
      }
      formData.append("amount", totalAmount);
      formData.append(
        "date",
        receipts[0]?.date || new Date().toISOString().slice(0, 10),
      );

      if (attachment.file) {
        formData.append("report_file", attachment.file);
      }
      if (attachment.templateJson) {
        formData.append("report_template_data", attachment.templateJson);
      }

      appendReceiptsToFormData(formData, receipts);

      await store.updateRequest(id, formData);

      addToast({
        message: "Reimbursement updated successfully!",
        type: "success",
      });
      emit("submitted");
      
      emit("close");
      router.push({ name: "Reimbursements" });
      
      return true;
    } finally {
      submitting.value = false;
    }
  }

  return {
    submitting,
    submitReimbursement,
    updateReimbursement,
  };
}
