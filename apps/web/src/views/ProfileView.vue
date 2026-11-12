<script setup>
import { ref, computed, reactive, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/composables/useToast";
import { formatDate, formatDateTime, getInitials } from "@/utils/formatters";
import BaseButton from "@/components/base/BaseButton.vue";
import BaseSignaturePad from "@/components/base/BaseSignaturePad.vue";
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Building2,
  Calendar,
  Shield,
  Key,
  History,
  Camera,
  Trash2,
  Edit3,
  Save,
  X,
  Lock,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  PenTool,
  Check,
  Info,
  Clock,
  Sparkles,
  Globe,
} from "lucide-vue-next";

const auth = useAuthStore();
const router = useRouter();
const { addToast } = useToast();

function handleBack() {
  if (typeof window !== "undefined" && window.history.state && window.history.state.back) {
    router.back();
  } else {
    router.push("/dashboard");
  }
}

// Active tab state: 'personal' | 'security' | 'activity'
const activeTab = ref("personal");

// ======================== EDIT PROFILE (G2-106) ========================
const isEditingProfile = ref(false);
const isSavingProfile = ref(false);
const profileForm = reactive({
  first_name: "",
  middle_name: "",
  last_name: "",
  contact_number: "",
});
const profileErrors = reactive({
  first_name: "",
  last_name: "",
  contact_number: "",
});

function initProfileForm() {
  const user = auth.user || {};
  profileForm.first_name = user.first_name || (user.name ? user.name.split(" ")[0] : "");
  profileForm.middle_name = user.middle_name || "";
  profileForm.last_name = user.last_name || (user.name ? user.name.split(" ").slice(1).join(" ") : "");
  profileForm.contact_number = user.contact_number || "";
  clearProfileErrors();
}

function clearProfileErrors() {
  profileErrors.first_name = "";
  profileErrors.last_name = "";
  profileErrors.contact_number = "";
}

function startEditingProfile() {
  activeTab.value = "personal";
  initProfileForm();
  isEditingProfile.value = true;
}

function cancelEditingProfile() {
  isEditingProfile.value = false;
  clearProfileErrors();
}

function validateProfileForm() {
  clearProfileErrors();
  let valid = true;

  if (!profileForm.first_name.trim()) {
    profileErrors.first_name = "First name is required.";
    valid = false;
  }
  if (!profileForm.last_name.trim()) {
    profileErrors.last_name = "Last name is required.";
    valid = false;
  }
  if (!profileForm.contact_number.trim()) {
    profileErrors.contact_number = "Contact number is required.";
    valid = false;
  } else {
    const phoneRegex = /^(\+63|0)?[0-9\s\-()]{7,18}$/;
    if (!phoneRegex.test(profileForm.contact_number.trim())) {
      profileErrors.contact_number = "Please enter a valid contact number (e.g., +63 917 123 4567 or 09171234567).";
      valid = false;
    }
  }

  return valid;
}

async function handleSaveProfile() {
  if (!validateProfileForm() || isSavingProfile.value) return;

  isSavingProfile.value = true;
  try {
    await auth.updateProfile({
      first_name: profileForm.first_name.trim(),
      middle_name: profileForm.middle_name.trim() || null,
      last_name: profileForm.last_name.trim(),
      contact_number: profileForm.contact_number.trim(),
    });

    addToast({
      type: "success",
      title: "Profile Updated",
      message: "Your profile details have been successfully saved.",
    });
    isEditingProfile.value = false;
  } catch (err) {
    addToast({
      type: "error",
      title: "Update Failed",
      message: err.message || "Failed to update profile details.",
    });
  } finally {
    isSavingProfile.value = false;
  }
}

// ======================== PHOTO UPLOAD (G2-107) ========================
const photoFileInput = ref(null);
const photoPreviewUrl = ref(null);
const pendingPhotoFile = ref(null);
const isUploadingPhoto = ref(false);
const isRemovingPhoto = ref(false);

function triggerPhotoSelect() {
  photoFileInput.value?.click();
}

function handlePhotoSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const validTypes = ["image/jpeg", "image/png", "image/jpg"];
  if (!validTypes.includes(file.type)) {
    addToast({
      type: "error",
      title: "Invalid File Type",
      message: "Only JPG and PNG image files are allowed.",
    });
    event.target.value = "";
    return;
  }

  const maxBytes = 2 * 1024 * 1024; // 2MB
  if (file.size > maxBytes) {
    addToast({
      type: "error",
      title: "File Too Large",
      message: "Profile photo must not exceed 2MB in size.",
    });
    event.target.value = "";
    return;
  }

  pendingPhotoFile.value = file;
  photoPreviewUrl.value = URL.createObjectURL(file);
}

function cancelPendingPhoto() {
  if (photoPreviewUrl.value) {
    URL.revokeObjectURL(photoPreviewUrl.value);
  }
  photoPreviewUrl.value = null;
  pendingPhotoFile.value = null;
  if (photoFileInput.value) {
    photoFileInput.value.value = "";
  }
}

async function handleSavePhoto() {
  if (!pendingPhotoFile.value || isUploadingPhoto.value) return;

  isUploadingPhoto.value = true;
  try {
    await auth.uploadProfilePhoto(pendingPhotoFile.value);
    addToast({
      type: "success",
      title: "Photo Updated",
      message: "Your new profile photo has been saved.",
    });
    cancelPendingPhoto();
  } catch (err) {
    addToast({
      type: "error",
      title: "Upload Failed",
      message: err.message || "Failed to upload profile photo.",
    });
  } finally {
    isUploadingPhoto.value = false;
  }
}

async function handleRemovePhoto() {
  if (isRemovingPhoto.value) return;
  isRemovingPhoto.value = true;
  try {
    await auth.removeProfilePhoto();
    addToast({
      type: "success",
      title: "Photo Removed",
      message: "Profile photo reverted to default initials avatar.",
    });
    cancelPendingPhoto();
  } catch (err) {
    addToast({
      type: "error",
      title: "Removal Failed",
      message: err.message || "Failed to remove profile photo.",
    });
  } finally {
    isRemovingPhoto.value = false;
  }
}

// ======================== DIGITAL SIGNATURE (G2-109) ========================
const isDrawingSignature = ref(false);
const newSignature = ref("");
const isSavingSignature = ref(false);
const isRemovingSignature = ref(false);

function startReplacingSignature() {
  newSignature.value = "";
  isDrawingSignature.value = true;
}

function cancelSignatureDrawing() {
  newSignature.value = "";
  isDrawingSignature.value = false;
}

async function handleSaveSignature() {
  if (!newSignature.value || isSavingSignature.value) return;

  isSavingSignature.value = true;
  try {
    await auth.saveSignature(newSignature.value);
    addToast({
      type: "success",
      title: "Signature Saved",
      message: "Your digital signature has been saved to your profile.",
    });
    isDrawingSignature.value = false;
  } catch (err) {
    addToast({
      type: "error",
      title: "Save Failed",
      message: err.message || "Failed to save signature.",
    });
  } finally {
    isSavingSignature.value = false;
  }
}

async function handleRemoveSignature() {
  if (isRemovingSignature.value) return;
  isRemovingSignature.value = true;
  try {
    await auth.removeSignature();
    addToast({
      type: "success",
      title: "Signature Removed",
      message: "Saved signature has been removed.",
    });
    newSignature.value = "";
    isDrawingSignature.value = false;
  } catch (err) {
    addToast({
      type: "error",
      title: "Removal Failed",
      message: err.message || "Failed to remove signature.",
    });
  } finally {
    isRemovingSignature.value = false;
  }
}

// ======================== CHANGE PASSWORD (G2-108) ========================
const isChangingPassword = ref(false);
const showCurrentPassword = ref(false);
const showNewPassword = ref(false);
const showConfirmPassword = ref(false);

const passwordForm = reactive({
  current_password: "",
  new_password: "",
  new_password_confirmation: "",
});
const passwordError = ref("");

const passwordRules = computed(() => {
  const p = passwordForm.new_password || "";
  const conf = passwordForm.new_password_confirmation || "";
  return {
    minLength: p.length >= 12,
    hasUpper: /[A-Z]/.test(p),
    hasLower: /[a-z]/.test(p),
    hasNumber: /[0-9]/.test(p),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>_\-+=\[\]]/.test(p),
    matchesConfirm: p.length > 0 && p === conf,
  };
});

const isNewPasswordValid = computed(() => {
  const r = passwordRules.value;
  return (
    r.minLength &&
    r.hasUpper &&
    r.hasLower &&
    r.hasNumber &&
    r.hasSpecial &&
    r.matchesConfirm &&
    Boolean(passwordForm.current_password)
  );
});

async function handlePasswordChange() {
  passwordError.value = "";
  if (!passwordForm.current_password) {
    passwordError.value = "Current password is required.";
    return;
  }
  if (!isNewPasswordValid.value) {
    passwordError.value = "Please ensure your new password satisfies all security requirements.";
    return;
  }

  isChangingPassword.value = true;
  try {
    await auth.changePassword({
      current_password: passwordForm.current_password,
      new_password: passwordForm.new_password,
      new_password_confirmation: passwordForm.new_password_confirmation,
    });

    addToast({
      type: "success",
      title: "Password Changed",
      message: "Your password has been successfully updated.",
    });

    passwordForm.current_password = "";
    passwordForm.new_password = "";
    passwordForm.new_password_confirmation = "";
  } catch (err) {
    passwordError.value = err.message || "Failed to change password. Please verify your current password.";
  } finally {
    isChangingPassword.value = false;
  }
}

// ======================== ACCOUNT ACTIVITY (G2-110) ========================
const isLoadingActivity = ref(false);
const activityData = ref({
  last_login_at: null,
  recent_logins: [],
  account_changes: [],
});

async function loadActivity() {
  isLoadingActivity.value = true;
  try {
    const data = await auth.fetchProfileActivity();
    activityData.value = data;
  } catch (err) {
    console.error("Failed to load activity logs:", err);
  } finally {
    isLoadingActivity.value = false;
  }
}

onMounted(() => {
  initProfileForm();
  loadActivity();
});
</script>

<template>
  <div class="flex flex-col gap-6 max-w-6xl mx-auto font-sans pb-12">
    <!-- Top Navigation & Action Bar -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <button
        type="button"
        data-testid="profile-back-btn"
        class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-primary transition-colors self-start cursor-pointer focus:outline-none"
        @click="handleBack"
      >
        <ArrowLeft class="w-4 h-4" />
        <span>Back</span>
      </button>

      <div class="flex items-center gap-2.5">
        <template v-if="isEditingProfile">
          <BaseButton
            variant="secondary"
            size="sm"
            :disabled="isSavingProfile"
            @click="cancelEditingProfile"
          >
            <X class="w-4 h-4 mr-1.5" />
            Cancel
          </BaseButton>
          <BaseButton
            data-testid="save-profile-btn"
            variant="primary"
            size="sm"
            :loading="isSavingProfile"
            @click="handleSaveProfile"
          >
            <Save class="w-4 h-4 mr-1.5" />
            Save Changes
          </BaseButton>
        </template>
        <template v-else>
          <BaseButton
            data-testid="edit-profile-cta-btn"
            variant="primary"
            size="sm"
            @click="startEditingProfile"
          >
            <Edit3 class="w-4 h-4 mr-1.5" />
            Edit Profile
          </BaseButton>
        </template>
      </div>
    </div>

    <!-- Main Profile Header Card (DSD Neutral Surface - Zero Colored Top Border) -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-left">
      <div class="p-6 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100">
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <!-- Avatar Section with Hover Overlay -->
          <div class="relative group shrink-0">
            <div class="w-20 h-20 rounded-full overflow-hidden border-2 border-slate-100 shadow-xs bg-slate-100 flex items-center justify-center">
              <img
                v-if="photoPreviewUrl || auth.user?.avatar_url"
                :src="photoPreviewUrl || auth.user?.avatar_url"
                :alt="auth.user?.name || 'User Avatar'"
                class="w-full h-full object-cover"
              />
              <span
                v-else
                class="text-xl font-bold font-heading text-slate-600 select-none"
              >
                {{ getInitials(auth.user?.name) }}
              </span>
            </div>

            <!-- Upload Camera Icon Button -->
            <button
              type="button"
              data-testid="upload-avatar-trigger"
              class="absolute -bottom-1 -right-1 p-2 rounded-full bg-white border border-slate-200 shadow-sm text-slate-600 hover:text-primary hover:bg-slate-50 transition-colors cursor-pointer"
              title="Upload new photo (JPG/PNG <= 2MB)"
              @click="triggerPhotoSelect"
            >
              <Camera class="w-3.5 h-3.5" />
            </button>

            <!-- Hidden File Input -->
            <input
              ref="photoFileInput"
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              class="hidden"
              @change="handlePhotoSelected"
            />
          </div>

          <!-- Identity & Metadata Lockup -->
          <div class="space-y-1">
            <div class="flex items-center gap-2.5 flex-wrap">
              <h1 class="text-2xl font-bold font-heading text-slate-900 tracking-tight">
                {{ auth.user?.name || "User Profile" }}
              </h1>
              <span
                :class="[
                  'text-[11px] font-semibold font-sans px-2.5 py-0.5 rounded-full inline-flex items-center',
                  auth.isAdmin
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-primary/10 text-primary border border-primary/20',
                ]"
              >
                {{ auth.user?.role ? (auth.user.role.charAt(0).toUpperCase() + auth.user.role.slice(1)) : (auth.isAdmin ? 'Admin' : 'Employee') }}
              </span>
            </div>

            <p class="text-xs text-slate-500 font-sans">
              {{ auth.user?.email || "No email on record" }}
            </p>

            <div class="flex items-center gap-2 pt-1 text-xs text-slate-500 font-sans flex-wrap">
              <span>
                Joined on {{ formatDate(auth.user?.created_at) || "Not set" }}
              </span>
            </div>
          </div>
        </div>

        <!-- Photo Actions (when preview selected or photo exists) -->
        <div v-if="photoPreviewUrl" class="flex items-center gap-2 animate-fade-in self-start md:self-center">
          <BaseButton
            variant="secondary"
            size="sm"
            :disabled="isUploadingPhoto"
            @click="cancelPendingPhoto"
          >
            Cancel
          </BaseButton>
          <BaseButton
            data-testid="save-photo-btn"
            variant="primary"
            size="sm"
            :loading="isUploadingPhoto"
            @click="handleSavePhoto"
          >
            <Save class="w-3.5 h-3.5 mr-1" />
            Save Photo
          </BaseButton>
        </div>
        <div v-else-if="auth.user?.avatar_url" class="self-start md:self-center">
          <button
            type="button"
            data-testid="remove-photo-btn"
            class="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-danger font-medium transition-colors cursor-pointer py-1 px-2 rounded-md hover:bg-slate-50"
            :disabled="isRemovingPhoto"
            @click="handleRemovePhoto"
          >
            <Trash2 class="w-3.5 h-3.5" />
            <span>{{ isRemovingPhoto ? "Removing..." : "Remove Photo" }}</span>
          </button>
        </div>
      </div>

      <!-- Admin Compliance Notice Banner (G2-105) -->
      <div
        v-if="auth.isAdmin"
        data-testid="admin-approval-notice"
        class="bg-slate-50/90 border-b border-slate-100 px-6 py-3 flex items-start gap-3 text-xs text-slate-600 font-sans"
      >
        <Shield class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <p class="leading-relaxed">
          <span class="font-bold text-slate-800">Admin Account Note:</span>
          Your account name is used as <span class="font-semibold text-slate-800">"Approved by"</span> and
          <span class="font-semibold text-slate-800">"Granted by"</span> in approvals and payout disbursements.
          Updating your name applies to new actions only; records already saved in the system retain their original name for audit compliance.
        </p>
      </div>

      <!-- Integrated Header Tab Bar (matching reference layout) -->
      <div class="px-6 flex items-center gap-8 border-b border-slate-100 overflow-x-auto scrollbar-none">
        <button
          type="button"
          data-testid="tab-personal"
          :class="[
            'py-3.5 text-xs font-semibold font-heading uppercase tracking-wider transition-colors relative cursor-pointer whitespace-nowrap',
            activeTab === 'personal'
              ? 'text-primary font-bold'
              : 'text-slate-500 hover:text-slate-800',
          ]"
          @click="activeTab = 'personal'"
        >
          <span>Personal & Work</span>
          <span
            v-if="activeTab === 'personal'"
            class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full"
          />
        </button>

        <button
          type="button"
          data-testid="tab-security"
          :class="[
            'py-3.5 text-xs font-semibold font-heading uppercase tracking-wider transition-colors relative cursor-pointer whitespace-nowrap',
            activeTab === 'security'
              ? 'text-primary font-bold'
              : 'text-slate-500 hover:text-slate-800',
          ]"
          @click="activeTab = 'security'"
        >
          <span>Security</span>
          <span
            v-if="activeTab === 'security'"
            class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full"
          />
        </button>

        <button
          type="button"
          data-testid="tab-activity"
          :class="[
            'py-3.5 text-xs font-semibold font-heading uppercase tracking-wider transition-colors relative cursor-pointer whitespace-nowrap flex items-center gap-1.5',
            activeTab === 'activity'
              ? 'text-primary font-bold'
              : 'text-slate-500 hover:text-slate-800',
          ]"
          @click="activeTab = 'activity'"
        >
          <span>Activity Log</span>
          <span
            v-if="activeTab === 'activity'"
            class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full"
          />
        </button>
      </div>
    </div>

    <!-- ==================== TAB 1: PERSONAL & WORK ==================== -->
    <div v-if="activeTab === 'personal'" class="grid grid-cols-1 lg:grid-cols-2 gap-6 text-left animate-fade-in">
      <!-- Left Column: Personal Information & Work Details -->
      <div class="space-y-6">
        <!-- Personal Information Card -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100">
            <div class="flex items-center gap-2">
              <User class="w-4 h-4 text-primary" />
              <h2 class="text-sm font-bold font-heading text-slate-800 uppercase tracking-wide">
                Personal Information
              </h2>
            </div>
            <button
              v-if="!isEditingProfile"
              type="button"
              data-testid="edit-personal-btn"
              class="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50 transition-colors cursor-pointer"
              title="Edit Personal Information"
              @click="startEditingProfile"
            >
              <Edit3 class="w-4 h-4" />
            </button>
          </div>

          <!-- View Mode -->
          <div v-if="!isEditingProfile" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
            <div>
              <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Full Name
              </p>
              <p class="text-sm font-medium text-slate-800 mt-0.5">
                {{ auth.user?.name || "Not set" }}
              </p>
            </div>

            <div>
              <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Contact Number
              </p>
              <p class="text-sm font-medium text-slate-800 mt-0.5">
                {{ auth.user?.contact_number || "Not set" }}
              </p>
            </div>

            <div class="sm:col-span-2">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Email Address (Read-only)
              </p>
              <div class="flex items-center gap-1.5 mt-0.5">
                <p class="text-sm font-medium text-slate-800">
                  {{ auth.user?.email || "Not set" }}
                </p>
                <Lock class="w-3.5 h-3.5 text-slate-400" title="Managed by Organization" />
              </div>
            </div>
          </div>

          <!-- Edit Mode -->
          <form v-else class="space-y-4" @submit.prevent="handleSaveProfile">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="space-y-1">
                <label class="input-label block">First Name <span class="text-danger">*</span></label>
                <input
                  v-model="profileForm.first_name"
                  type="text"
                  data-testid="input-first-name"
                  class="input w-full"
                  placeholder="First name"
                />
                <p v-if="profileErrors.first_name" class="text-[11px] text-danger">
                  {{ profileErrors.first_name }}
                </p>
              </div>

              <div class="space-y-1">
                <label class="input-label block">Middle Name</label>
                <input
                  v-model="profileForm.middle_name"
                  type="text"
                  data-testid="input-middle-name"
                  class="input w-full"
                  placeholder="Middle name (optional)"
                />
              </div>

              <div class="space-y-1 sm:col-span-2">
                <label class="input-label block">Last Name <span class="text-danger">*</span></label>
                <input
                  v-model="profileForm.last_name"
                  type="text"
                  data-testid="input-last-name"
                  class="input w-full"
                  placeholder="Last name"
                />
                <p v-if="profileErrors.last_name" class="text-[11px] text-danger">
                  {{ profileErrors.last_name }}
                </p>
              </div>
            </div>

            <div class="space-y-1">
              <label class="input-label block">Contact Number <span class="text-danger">*</span></label>
              <input
                v-model="profileForm.contact_number"
                type="text"
                data-testid="input-contact-number"
                class="input w-full"
                placeholder="+63 917 123 4567"
              />
              <p v-if="profileErrors.contact_number" class="text-[11px] text-danger">
                {{ profileErrors.contact_number }}
              </p>
            </div>

            <div class="space-y-1">
              <label class="input-label block text-slate-400">
                Email Address (Company Controlled)
              </label>
              <div class="relative">
                <input
                  :value="auth.user?.email"
                  type="text"
                  disabled
                  class="input w-full bg-slate-50 text-slate-400 cursor-not-allowed pr-8"
                />
                <Lock class="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
              <p class="text-[10px] text-slate-400">
                Email addresses are controlled centrally and cannot be changed here.
              </p>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <BaseButton
                variant="secondary"
                size="sm"
                :disabled="isSavingProfile"
                @click="cancelEditingProfile"
              >
                Cancel
              </BaseButton>
              <BaseButton
                variant="primary"
                size="sm"
                type="submit"
                :loading="isSavingProfile"
              >
                Save Details
              </BaseButton>
            </div>
          </form>
        </div>

        <!-- Work & Role Information Card (Read-only company-controlled fields) -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100">
            <div class="flex items-center gap-2">
              <Building2 class="w-4 h-4 text-primary" />
              <h2 class="text-sm font-bold font-heading text-slate-800 uppercase tracking-wide">
                Work & Organizational Role
              </h2>
            </div>
            <span class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Lock class="w-3 h-3" /> Read-Only
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
            <div>
              <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Employee ID
              </p>
              <p class="text-sm font-bold font-mono text-primary mt-0.5">
                {{ auth.user?.employee_id || "EMP-0001" }}
              </p>
            </div>

            <div>
              <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                System Role
              </p>
              <p class="text-sm font-medium text-slate-800 mt-0.5">
                {{ auth.user?.role ? (auth.user.role.charAt(0).toUpperCase() + auth.user.role.slice(1)) : "Employee" }}
              </p>
            </div>

            <div>
              <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Department
              </p>
              <p class="text-sm font-medium text-slate-800 mt-0.5">
                {{ auth.user?.department || "Not set" }}
              </p>
            </div>

            <div>
              <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Grade / Level
              </p>
              <p class="text-sm font-medium text-slate-800 mt-0.5">
                {{ auth.user?.grade || "Not set" }}
              </p>
            </div>

            <div class="sm:col-span-2">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Date Joined
              </p>
              <p class="text-sm font-medium text-slate-800 mt-0.5">
                {{ formatDate(auth.user?.created_at) || "Not set" }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Digital Signature Card (G2-109) -->
      <div class="space-y-6">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100">
            <div class="flex items-center gap-2">
              <PenTool class="w-4 h-4 text-primary" />
              <h2 class="text-sm font-bold font-heading text-slate-800 uppercase tracking-wide">
                Digital Signature
              </h2>
            </div>
            <span
              v-if="auth.user?.has_signature || auth.user?.signature"
              class="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"
            >
              Configured
            </span>
            <span
              v-else
              class="text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full"
            >
              Not Configured
            </span>
          </div>

          <!-- Existing Signature Preview -->
          <template v-if="(auth.user?.signature || auth.user?.has_signature) && !isDrawingSignature">
            <div class="rounded-xl border border-slate-200 bg-slate-50/50 p-4 flex flex-col items-center justify-center min-h-[144px]">
              <img
                :src="auth.user.signature"
                alt="Saved Digital Signature"
                class="max-h-24 max-w-full object-contain"
              />
            </div>

            <div class="rounded-lg bg-emerald-50 border border-emerald-200/80 p-3 flex items-start gap-2.5 text-xs text-emerald-800 font-sans">
              <CheckCircle2 class="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <p class="leading-relaxed">
                Your signature is saved and will be automatically pre-filled when you sign payout disbursements (Admin) or payout receipts (Employee).
              </p>
            </div>

            <div class="flex items-center justify-between pt-2">
              <button
                type="button"
                data-testid="remove-signature-btn"
                class="text-xs text-slate-400 hover:text-danger flex items-center gap-1 font-medium transition-colors cursor-pointer"
                :disabled="isRemovingSignature"
                @click="handleRemoveSignature"
              >
                <Trash2 class="w-3.5 h-3.5" />
                <span>{{ isRemovingSignature ? "Removing..." : "Remove Signature" }}</span>
              </button>

              <BaseButton
                data-testid="replace-signature-btn"
                variant="secondary"
                size="sm"
                @click="startReplacingSignature"
              >
                <Edit3 class="w-3.5 h-3.5 mr-1" />
                Replace Signature
              </BaseButton>
            </div>
          </template>

          <!-- Signature Pad (New or Replacing) -->
          <template v-else>
            <div class="space-y-3">
              <BaseSignaturePad
                v-model="newSignature"
                label="Draw Your Signature"
                placeholder="Draw your signature using mouse or finger"
                heightClass="h-40"
                :allow-profile-signature="false"
              />

              <p class="text-[11px] text-slate-400 leading-relaxed font-sans">
                Draw your official signature above. Once saved, it will be automatically pre-filled in your payout modals while allowing you to redraw when needed.
              </p>

              <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <BaseButton
                  v-if="auth.user?.signature"
                  variant="secondary"
                  size="sm"
                  :disabled="isSavingSignature"
                  @click="cancelSignatureDrawing"
                >
                  Cancel
                </BaseButton>

                <BaseButton
                  data-testid="save-signature-btn"
                  variant="primary"
                  size="sm"
                  :loading="isSavingSignature"
                  :disabled="!newSignature || isSavingSignature"
                  @click="handleSaveSignature"
                >
                  <Save class="w-3.5 h-3.5 mr-1" />
                  Save Signature
                </BaseButton>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- ==================== TAB 2: SECURITY ==================== -->
    <div v-else-if="activeTab === 'security'" class="max-w-2xl text-left animate-fade-in">
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-6">
        <div class="pb-4 border-b border-slate-100 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Key class="w-4 h-4" />
            </div>
            <div>
              <h2 class="text-base font-bold font-heading text-slate-800">
                Change Password
              </h2>
              <p class="text-xs text-slate-500 font-sans mt-0.5">
                Update your account password. Changes are verified with your organization's security service.
              </p>
            </div>
          </div>
        </div>

        <div v-if="passwordError" class="rounded-xl border border-danger/30 bg-danger/5 p-3.5 flex items-start gap-2.5 text-xs text-danger">
          <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
          <span>{{ passwordError }}</span>
        </div>

        <form class="space-y-4" @submit.prevent="handlePasswordChange">
          <!-- Current Password -->
          <div class="space-y-1">
            <label class="input-label block">Current Password <span class="text-danger">*</span></label>
            <div class="relative">
              <input
                v-model="passwordForm.current_password"
                :type="showCurrentPassword ? 'text' : 'password'"
                data-testid="input-current-password"
                class="input w-full pr-10"
                placeholder="Enter current password"
                autocomplete="current-password"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                tabindex="-1"
                @click="showCurrentPassword = !showCurrentPassword"
              >
                <Eye v-if="!showCurrentPassword" class="w-4 h-4" />
                <EyeOff v-else class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- New Password -->
          <div class="space-y-1">
            <label class="input-label block">New Password <span class="text-danger">*</span></label>
            <div class="relative">
              <input
                v-model="passwordForm.new_password"
                :type="showNewPassword ? 'text' : 'password'"
                data-testid="input-new-password"
                class="input w-full pr-10"
                placeholder="Enter new strong password"
                autocomplete="new-password"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                tabindex="-1"
                @click="showNewPassword = !showNewPassword"
              >
                <Eye v-if="!showNewPassword" class="w-4 h-4" />
                <EyeOff v-else class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Confirm Password -->
          <div class="space-y-1">
            <label class="input-label block">Confirm New Password <span class="text-danger">*</span></label>
            <div class="relative">
              <input
                v-model="passwordForm.new_password_confirmation"
                :type="showConfirmPassword ? 'text' : 'password'"
                data-testid="input-confirm-password"
                class="input w-full pr-10"
                placeholder="Confirm new password"
                autocomplete="new-password"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                tabindex="-1"
                @click="showConfirmPassword = !showConfirmPassword"
              >
                <Eye v-if="!showConfirmPassword" class="w-4 h-4" />
                <EyeOff v-else class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Interactive Requirements Checklist -->
          <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2 text-xs font-sans">
            <p class="font-bold uppercase tracking-wider text-[10px] text-slate-500">
              Password Security Requirements
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
              <div class="flex items-center gap-1.5" :class="passwordRules.minLength ? 'text-emerald-700 font-medium' : 'text-slate-500'">
                <Check v-if="passwordRules.minLength" class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span v-else class="w-1.5 h-1.5 rounded-full bg-slate-300 mx-1 shrink-0" />
                <span>At least 12 characters</span>
              </div>

              <div class="flex items-center gap-1.5" :class="passwordRules.hasUpper ? 'text-emerald-700 font-medium' : 'text-slate-500'">
                <Check v-if="passwordRules.hasUpper" class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span v-else class="w-1.5 h-1.5 rounded-full bg-slate-300 mx-1 shrink-0" />
                <span>At least one uppercase letter (A-Z)</span>
              </div>

              <div class="flex items-center gap-1.5" :class="passwordRules.hasLower ? 'text-emerald-700 font-medium' : 'text-slate-500'">
                <Check v-if="passwordRules.hasLower" class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span v-else class="w-1.5 h-1.5 rounded-full bg-slate-300 mx-1 shrink-0" />
                <span>At least one lowercase letter (a-z)</span>
              </div>

              <div class="flex items-center gap-1.5" :class="passwordRules.hasNumber ? 'text-emerald-700 font-medium' : 'text-slate-500'">
                <Check v-if="passwordRules.hasNumber" class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span v-else class="w-1.5 h-1.5 rounded-full bg-slate-300 mx-1 shrink-0" />
                <span>At least one number (0-9)</span>
              </div>

              <div class="flex items-center gap-1.5" :class="passwordRules.hasSpecial ? 'text-emerald-700 font-medium' : 'text-slate-500'">
                <Check v-if="passwordRules.hasSpecial" class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span v-else class="w-1.5 h-1.5 rounded-full bg-slate-300 mx-1 shrink-0" />
                <span>At least one special symbol (!@#$...)</span>
              </div>

              <div class="flex items-center gap-1.5" :class="passwordRules.matchesConfirm ? 'text-emerald-700 font-medium' : 'text-slate-500'">
                <Check v-if="passwordRules.matchesConfirm" class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span v-else class="w-1.5 h-1.5 rounded-full bg-slate-300 mx-1 shrink-0" />
                <span>Passwords match</span>
              </div>
            </div>
          </div>

          <div class="pt-3 border-t border-slate-100 flex items-center justify-end">
            <BaseButton
              data-testid="submit-password-btn"
              variant="primary"
              size="sm"
              type="submit"
              :loading="isChangingPassword"
              :disabled="!isNewPasswordValid || isChangingPassword"
              @click="handlePasswordChange"
            >
              Update Password
            </BaseButton>
          </div>
        </form>
      </div>
    </div>

    <!-- ==================== TAB 3: ACTIVITY LOG ==================== -->
    <div v-else-if="activeTab === 'activity'" class="grid grid-cols-1 lg:grid-cols-2 gap-6 text-left animate-fade-in">
      <!-- Left Card: Login History & Last Access -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <div class="flex items-center gap-2">
            <History class="w-4 h-4 text-primary" />
            <h2 class="text-sm font-bold font-heading text-slate-800 uppercase tracking-wide">
              Login History & Access
            </h2>
          </div>
          <span class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Your Account Only
          </span>
        </div>

        <!-- Highlight Callout for Last Login -->
        <div class="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3.5">
          <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Clock class="w-4 h-4" />
          </div>
          <div>
            <p class="text-[10px] font-bold uppercase tracking-wider text-primary">
              Last Login Time
            </p>
            <p class="text-sm font-semibold text-slate-800 mt-0.5 font-sans tabular-nums">
              {{ formatDateTime(activityData.last_login_at || auth.user?.last_login_at) }}
            </p>
          </div>
        </div>

        <!-- Recent Logins List -->
        <div class="space-y-3">
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Recent Logins
          </p>

          <div v-if="activityData.recent_logins.length === 0" class="py-6 text-center text-xs text-slate-400">
            No recent login records available.
          </div>

          <div v-else class="divide-y divide-slate-100">
            <div
              v-for="login in activityData.recent_logins"
              :key="login.id"
              class="py-3 flex items-center justify-between gap-3 text-xs font-sans"
            >
              <div class="flex items-center gap-2.5">
                <span class="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                <div>
                  <p class="font-medium text-slate-800">
                    {{ login.label || "Signed In" }}
                  </p>
                  <p class="text-[11px] text-slate-400 font-sans tabular-nums">
                    {{ formatDateTime(login.created_at) }}
                  </p>
                </div>
              </div>

              <span class="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                Session Recorded
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Card: Recent Account Changes -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <div class="flex items-center gap-2">
            <Shield class="w-4 h-4 text-primary" />
            <h2 class="text-sm font-bold font-heading text-slate-800 uppercase tracking-wide">
              Recent Account Changes
            </h2>
          </div>
          <span class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Immutable Audit Trail
          </span>
        </div>

        <div v-if="activityData.account_changes.length === 0" class="py-8 text-center text-xs text-slate-400">
          No profile changes recorded for this account yet.
        </div>

        <div v-else class="divide-y divide-slate-100 max-h-[480px] overflow-y-auto scrollbar-thin">
          <div
            v-for="change in activityData.account_changes"
            :key="change.id"
            class="py-3 space-y-1.5 text-xs font-sans"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold text-slate-800">
                {{ change.label }}
              </span>
              <span class="text-[11px] text-slate-400 font-sans tabular-nums">
                {{ formatDateTime(change.created_at) }}
              </span>
            </div>

            <!-- Field changes diff -->
            <div v-if="change.changes && change.changes.length > 0" class="space-y-1 pl-2 border-l-2 border-slate-200 mt-1">
              <div
                v-for="(diff, idx) in change.changes"
                :key="idx"
                class="text-[11px] text-slate-600"
              >
                <span class="font-medium text-slate-700">{{ diff.field }}:</span>
                <span class="line-through text-slate-400 mx-1">{{ diff.before || "None" }}</span>
                <span class="text-slate-400">→</span>
                <span class="text-primary font-semibold ml-1">{{ diff.after }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.15s ease-out;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
