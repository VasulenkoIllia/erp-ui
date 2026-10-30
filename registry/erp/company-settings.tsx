import { CompanyBranchesSection } from "@/registry/erp/company-branches"
import { CompanyImages } from "@/registry/erp/company-images"
import { CompanyProfileForm } from "@/registry/erp/company-profile-form"

/**
 * Налаштування компанії (ADR-0014, основа A1): реквізити для рахунків і документів, логотип і
 * печатка, філії. Читати може кожен у компанії, змінювати — право `company:update`; без нього
 * все лише для перегляду.
 *
 *   <CompanyProfileForm />  <CompanyImages />  <CompanyBranchesSection />
 */
export { CompanyBranchesSection, CompanyImages, CompanyProfileForm }
