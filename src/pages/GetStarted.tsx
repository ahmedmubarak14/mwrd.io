import { logger } from '@/src/utils/logger';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { LanguageToggle } from '../components/LanguageToggle';
import { leadsService } from '../services/leadsService';

interface GetStartedProps {
  onBack: () => void;
}

const getStartedSchema = z.object({
  accountType: z.string().min(1, 'Please select an account type').refine(
    (val) => ['client', 'supplier'].includes(val),
    { message: 'Please select a valid account type' }
  ),
  name: z.string().min(2, 'Your name is required'),
  position: z.string().optional(),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(8, 'Please enter a valid phone number'),
  companyName: z.string().min(2, 'Company name is required'),
  commercialRegistration: z.string().min(1, 'Commercial Registration number is required'),
  taxId: z.string().min(1, 'Tax ID (VAT number) is required'),
  notes: z.string().optional()
});

type GetStartedFormData = z.infer<typeof getStartedSchema>;

const TOTAL_STEPS = 4;

/* ─── Step indicator ─── */
const StepIndicator: React.FC<{ currentStep: number; totalSteps: number; labels: string[] }> = ({ currentStep, totalSteps, labels }) => (
  <div className="flex items-center justify-center gap-2 mb-10">
    {Array.from({ length: totalSteps }, (_, i) => {
      const stepNum = i + 1;
      const isActive = stepNum === currentStep;
      const isCompleted = stepNum < currentStep;
      return (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center gap-1.5">
            <div className={`
              w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500
              ${isActive ? 'bg-[#0A2540] text-white scale-110 shadow-lg shadow-[#0A2540]/30' : ''}
              ${isCompleted ? 'bg-[#00C49A] text-white' : ''}
              ${!isActive && !isCompleted ? 'bg-gray-200 text-gray-400' : ''}
            `}>
              {isCompleted ? (
                <span className="material-symbols-outlined text-lg">check</span>
              ) : stepNum}
            </div>
            <span className={`text-xs font-medium hidden sm:block max-w-[80px] text-center leading-tight ${isActive ? 'text-[#0A2540]' : isCompleted ? 'text-[#00C49A]' : 'text-gray-400'}`}>
              {labels[i]}
            </span>
          </div>
          {i < totalSteps - 1 && (
            <div className={`w-8 sm:w-16 h-0.5 rounded-full transition-all duration-500 mt-[-20px] sm:mt-[-16px] ${isCompleted ? 'bg-[#00C49A]' : 'bg-gray-200'}`} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

export const GetStarted: React.FC<GetStartedProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors }
  } = useForm<GetStartedFormData>({
    resolver: zodResolver(getStartedSchema),
    mode: 'onTouched'
  });

  const accountType = watch('accountType');

  const stepLabels = [
    t('getStarted.step1Title'),
    t('getStarted.step2Title'),
    t('getStarted.step3Title'),
    t('getStarted.step4Title'),
  ];

  const handleNext = async () => {
    let fieldsToValidate: (keyof GetStartedFormData)[] = [];
    if (currentStep === 1) fieldsToValidate = ['accountType'];
    if (currentStep === 2) fieldsToValidate = ['name', 'email', 'phone'];
    if (currentStep === 3) fieldsToValidate = ['companyName', 'commercialRegistration', 'taxId'];

    const valid = await trigger(fieldsToValidate);
    if (valid) setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const handleBack = () => setCurrentStep((s) => Math.max(s - 1, 1));

  const onSubmit = async (data: GetStartedFormData) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await leadsService.submitLead({
        name: data.name,
        company_name: data.companyName,
        email: data.email,
        phone: data.phone,
        account_type: data.accountType as 'client' | 'supplier',
        notes: data.notes,
        commercial_registration: data.commercialRegistration,
        tax_id: data.taxId,
      });

      logger.info('Lead submitted successfully', { accountType: data.accountType });
      setIsSubmitted(true);
    } catch (error: any) {
      logger.error('Error submitting lead:', error);
      setErrorMessage(error.message || t('getStarted.errors.submitFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  /* ═══════════════ SUCCESS SCREEN ═══════════════ */
  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F6F9FC] via-[#e8f0fe] to-[#d5f0ea] p-4 font-sans">
        <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-10 md:p-16 max-w-lg w-full text-center border border-white/50">
          {/* Animated check */}
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full bg-[#00C49A]/20 animate-ping" />
            <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-[#00C49A] to-[#00a67d] flex items-center justify-center shadow-lg shadow-[#00C49A]/30">
              <span className="material-symbols-outlined text-white text-5xl">check</span>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-[#0A2540] mb-4">{t('getStarted.successTitle')}</h1>
          <p className="text-[#6b7280] text-lg leading-relaxed mb-10">{t('getStarted.successMessage')}</p>

          <button
            onClick={onBack}
            className="w-full group flex items-center justify-center gap-2 rounded-2xl h-14 bg-[#0A2540] hover:bg-[#0d3157] text-white font-bold text-base transition-all duration-300 hover:shadow-lg hover:shadow-[#0A2540]/20"
          >
            <span className="material-symbols-outlined text-lg transform group-hover:-translate-x-1 transition-transform">arrow_back</span>
            {t('getStarted.backToHome')}
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════ WIZARD FORM ═══════════════ */
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#F6F9FC] via-[#e8f0fe] to-[#d5f0ea] font-sans">
      {/* Header */}
      <header className="bg-white/60 backdrop-blur-lg border-b border-white/30">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between py-3 md:py-4">
            <button onClick={onBack} className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity min-h-[44px]">
              <div className="size-7 text-[#0A2540]">
                <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path d="M44 4H30.6666V17.3334H17.3334V30.6666H4V44H44V4Z" fill="currentColor" />
                </svg>
              </div>
              <span className="text-[#0A2540] text-lg md:text-xl font-bold tracking-tight">{t('brand.name')}</span>
            </button>
            <LanguageToggle variant="minimal" />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-2xl">
          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-3xl md:text-4xl font-bold text-[#0A2540] mb-2">{t('getStarted.title')}</h1>
            <p className="text-[#6b7280] text-base">{t('getStarted.subtitle')}</p>
          </div>

          {/* Step Indicator */}
          <StepIndicator currentStep={currentStep} totalSteps={TOTAL_STEPS} labels={stepLabels} />

          {/* Card */}
          <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-xl border border-white/50 p-8 md:p-10">
            {/* Step title */}
            <div className="mb-8">
              <h2 className="text-xl md:text-2xl font-bold text-[#0A2540]">
                {t(`getStarted.step${currentStep}Title`)}
              </h2>
              <p className="text-[#6b7280] text-sm mt-1">
                {t(`getStarted.step${currentStep}Subtitle`)}
              </p>
            </div>

            {errorMessage && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">error</span>
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)}>
              {/* ── STEP 1: Account Type ── */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div
                    onClick={() => setValue('accountType', 'client', { shouldValidate: true })}
                    className={`group relative cursor-pointer rounded-2xl p-6 border-2 transition-all duration-300 ${accountType === 'client'
                        ? 'border-[#0A2540] bg-[#0A2540]/5 shadow-lg shadow-[#0A2540]/10'
                        : 'border-gray-200 hover:border-[#0A2540]/30 hover:shadow-md'
                      }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${accountType === 'client' ? 'bg-[#0A2540] shadow-lg shadow-[#0A2540]/20' : 'bg-gray-100 group-hover:bg-[#0A2540]/10'
                        }`}>
                        <span className={`material-symbols-outlined text-2xl ${accountType === 'client' ? 'text-white' : 'text-[#0A2540]'}`}>shopping_bag</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-[#0A2540]">{t('getStarted.client')}</h3>
                        <p className="text-sm text-[#6b7280]">{t('getStarted.clientDesc')}</p>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${accountType === 'client' ? 'border-[#0A2540] bg-[#0A2540]' : 'border-gray-300'
                        }`}>
                        {accountType === 'client' && <span className="material-symbols-outlined text-white text-sm">check</span>}
                      </div>
                    </div>
                  </div>

                  <div
                    onClick={() => setValue('accountType', 'supplier', { shouldValidate: true })}
                    className={`group relative cursor-pointer rounded-2xl p-6 border-2 transition-all duration-300 ${accountType === 'supplier'
                        ? 'border-[#00C49A] bg-[#00C49A]/5 shadow-lg shadow-[#00C49A]/10'
                        : 'border-gray-200 hover:border-[#00C49A]/30 hover:shadow-md'
                      }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${accountType === 'supplier' ? 'bg-[#00C49A] shadow-lg shadow-[#00C49A]/20' : 'bg-gray-100 group-hover:bg-[#00C49A]/10'
                        }`}>
                        <span className={`material-symbols-outlined text-2xl ${accountType === 'supplier' ? 'text-white' : 'text-[#00C49A]'}`}>storefront</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-[#0A2540]">{t('getStarted.supplier')}</h3>
                        <p className="text-sm text-[#6b7280]">{t('getStarted.supplierDesc')}</p>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${accountType === 'supplier' ? 'border-[#00C49A] bg-[#00C49A]' : 'border-gray-300'
                        }`}>
                        {accountType === 'supplier' && <span className="material-symbols-outlined text-white text-sm">check</span>}
                      </div>
                    </div>
                  </div>

                  <input type="hidden" {...register('accountType')} />
                  {errors.accountType && (
                    <p className="text-red-500 text-sm mt-2">{t('getStarted.errors.accountType')}</p>
                  )}
                </div>
              )}

              {/* ── STEP 2: Contact Info ── */}
              {currentStep === 2 && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-[#0A2540] mb-2">{t('getStarted.yourName')}</label>
                    <input
                      {...register('name')}
                      type="text"
                      placeholder={t('getStarted.yourNamePlaceholder')}
                      className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[#0A2540] placeholder:text-gray-400 focus:ring-2 focus:ring-[#0A2540]/20 focus:border-[#0A2540] outline-none transition-all bg-white/80"
                    />
                    {errors.name && <p className="text-red-500 text-sm mt-1.5">{t('getStarted.errors.name')}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#0A2540] mb-2">{t('getStarted.position')} <span className="text-gray-400 font-normal">({t('getStarted.optional')})</span></label>
                    <input
                      {...register('position')}
                      type="text"
                      placeholder={t('getStarted.positionPlaceholder')}
                      className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[#0A2540] placeholder:text-gray-400 focus:ring-2 focus:ring-[#0A2540]/20 focus:border-[#0A2540] outline-none transition-all bg-white/80"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#0A2540] mb-2">{t('getStarted.email')}</label>
                    <input
                      {...register('email')}
                      type="email"
                      placeholder={t('getStarted.emailPlaceholder')}
                      className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[#0A2540] placeholder:text-gray-400 focus:ring-2 focus:ring-[#0A2540]/20 focus:border-[#0A2540] outline-none transition-all bg-white/80"
                    />
                    {errors.email && <p className="text-red-500 text-sm mt-1.5">{t('getStarted.errors.email')}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#0A2540] mb-2">{t('getStarted.phone')}</label>
                    <input
                      {...register('phone')}
                      type="tel"
                      placeholder={t('getStarted.phonePlaceholder')}
                      className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[#0A2540] placeholder:text-gray-400 focus:ring-2 focus:ring-[#0A2540]/20 focus:border-[#0A2540] outline-none transition-all bg-white/80"
                    />
                    {errors.phone && <p className="text-red-500 text-sm mt-1.5">{t('getStarted.errors.phone')}</p>}
                  </div>
                </div>
              )}

              {/* ── STEP 3: Company Details ── */}
              {currentStep === 3 && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-[#0A2540] mb-2">{t('getStarted.companyName')}</label>
                    <input
                      {...register('companyName')}
                      type="text"
                      placeholder={t('getStarted.companyNamePlaceholder')}
                      className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[#0A2540] placeholder:text-gray-400 focus:ring-2 focus:ring-[#0A2540]/20 focus:border-[#0A2540] outline-none transition-all bg-white/80"
                    />
                    {errors.companyName && <p className="text-red-500 text-sm mt-1.5">{t('getStarted.errors.companyName')}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#0A2540] mb-2">{t('getStarted.commercialRegistration')}</label>
                    <input
                      {...register('commercialRegistration')}
                      type="text"
                      placeholder={t('getStarted.crPlaceholder')}
                      className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[#0A2540] placeholder:text-gray-400 focus:ring-2 focus:ring-[#0A2540]/20 focus:border-[#0A2540] outline-none transition-all bg-white/80"
                    />
                    {errors.commercialRegistration && <p className="text-red-500 text-sm mt-1.5">{t('getStarted.errors.cr')}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#0A2540] mb-2">{t('getStarted.taxId')}</label>
                    <input
                      {...register('taxId')}
                      type="text"
                      placeholder={t('getStarted.taxIdPlaceholder')}
                      className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[#0A2540] placeholder:text-gray-400 focus:ring-2 focus:ring-[#0A2540]/20 focus:border-[#0A2540] outline-none transition-all bg-white/80"
                    />
                    {errors.taxId && <p className="text-red-500 text-sm mt-1.5">{t('getStarted.errors.taxId')}</p>}
                  </div>
                </div>
              )}

              {/* ── STEP 4: Notes ── */}
              {currentStep === 4 && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-[#0A2540] mb-2">
                      {t('getStarted.notes')} <span className="text-gray-400 font-normal">({t('getStarted.optional')})</span>
                    </label>
                    <textarea
                      {...register('notes')}
                      rows={5}
                      placeholder={t('getStarted.notesPlaceholder')}
                      className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[#0A2540] placeholder:text-gray-400 focus:ring-2 focus:ring-[#0A2540]/20 focus:border-[#0A2540] outline-none transition-all resize-none bg-white/80"
                    />
                  </div>
                  <p className="text-xs text-gray-400 text-center">{t('getStarted.privacyNote')}</p>
                </div>
              )}

              {/* ── Navigation Buttons ── */}
              <div className="flex gap-3 mt-8">
                {currentStep > 1 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex-1 group flex items-center justify-center gap-2 rounded-2xl h-13 px-6 bg-gray-100 text-[#0A2540] font-bold text-base hover:bg-gray-200 transition-all duration-300"
                  >
                    <span className="material-symbols-outlined text-lg transform group-hover:-translate-x-1 transition-transform">arrow_back</span>
                    {t('getStarted.back')}
                  </button>
                )}

                {currentStep < TOTAL_STEPS ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex-1 group flex items-center justify-center gap-2 rounded-2xl h-13 px-6 bg-[#0A2540] text-white font-bold text-base hover:bg-[#0d3157] transition-all duration-300 hover:shadow-lg hover:shadow-[#0A2540]/20"
                  >
                    {t('getStarted.next')}
                    <span className="material-symbols-outlined text-lg transform group-hover:translate-x-1 transition-transform">arrow_forward</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 group flex items-center justify-center gap-2 rounded-2xl h-13 px-6 bg-[#00C49A] text-white font-bold text-base hover:bg-[#00a67d] transition-all duration-300 hover:shadow-lg hover:shadow-[#00C49A]/20 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                    ) : (
                      <>
                        {t('getStarted.submitButton')}
                        <span className="material-symbols-outlined text-lg transform group-hover:translate-x-1 transition-transform">send</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};
