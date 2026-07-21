/**
 * script.js - Air Medical India
 * Consolidated Engine for Animations, Interactions, and Supabase Lead Generation
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. CORE ANIMATION ENGINE (Intersection Observer) ---
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');

                // Special handling: Trigger counters if the element contains them
                const stats = entry.target.querySelectorAll('.stat-number');
                if (stats.length > 0) {
                    animateStats(stats);
                }

                revealObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Target all revealable elements
    const revealElements = document.querySelectorAll(
        '.scroll-reveal, .scroll-reveal-text, .scroll-reveal-left, .scroll-reveal-right, ' +
        '.scroll-reveal-up, .scroll-reveal-scale, .scroll-reveal-form, .service-card, ' +
        '.feature-item, .stat-item, .form-field'
    );

    revealElements.forEach(el => revealObserver.observe(el));

    // Staggered animation for certification cards
    const certObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const delay = parseInt(entry.target.getAttribute('data-delay') || '0');
                setTimeout(() => {
                    entry.target.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                    entry.target.classList.remove('opacity-0', 'translate-y-6');
                    entry.target.classList.add('opacity-100', 'translate-y-0');
                }, delay);
                certObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll('.cert-card').forEach(card => certObserver.observe(card));

    // --- 2. STAT COUNTER LOGIC ---
    function animateStats(stats) {
        stats.forEach(stat => {
            if (stat.dataset.animated) return;
            stat.dataset.animated = 'true';

            const target = +stat.getAttribute('data-target');
            if (isNaN(target) || target <= 0) return;

            const duration = 2000; // 2 seconds
            const startTime = performance.now();

            const updateCount = (timestamp) => {
                const progress = Math.min((timestamp - startTime) / duration, 1);
                const current = Math.floor(progress * target);

                stat.innerText = current.toLocaleString('en-US');

                if (progress < 1) {
                    requestAnimationFrame(updateCount);
                } else {
                    stat.innerText = target.toLocaleString('en-US');
                }
            };
            requestAnimationFrame(updateCount);
        });
    }

    // Trigger counters for any stat items visible on initial load
    setTimeout(() => {
        document.querySelectorAll('.stat-item').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom >= 0) {
                const stats = el.querySelectorAll('.stat-number');
                if (stats.length > 0) animateStats(stats);
            }
        });
    }, 150);


    // --- 3. NAVIGATION & UI EFFECTS ---
    const navbar = document.getElementById('navbar');

    // Persistent Header Logic (As requested: Logo & Hotline always visible)
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 50) {
            navbar.classList.add('shadow-lg');
            navbar.style.transform = 'translateY(0)';
        } else {
            navbar.classList.remove('shadow-lg');
        }
    }, { passive: true });

    // Service Card Hover Enhancements
    const serviceCards = document.querySelectorAll('.service-card');
    serviceCards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            const icon = card.querySelector('.service-icon');
            if (icon) icon.style.fontVariationSettings = "'FILL' 1, 'wght' 400";
        });
        card.addEventListener('mouseleave', () => {
            const icon = card.querySelector('.service-icon');
            if (icon) icon.style.fontVariationSettings = "'FILL' 0, 'wght' 300";
        });
    });

    // FAQ Accordion
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const button = item.querySelector('button');
        button.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            faqItems.forEach(oi => {
                oi.classList.remove('active');
                oi.querySelector('.faq-answer')?.classList.add('hidden');
            });
            if (!isActive) {
                item.classList.add('active');
                item.querySelector('.faq-answer')?.classList.remove('hidden');
            }
        });
    });


    // --- 4. SUPABASE LEAD GENERATION ENGINE ---
    const quoteForm = document.getElementById('quote-form');
    if (quoteForm) {
        quoteForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = quoteForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;

            // Validate Supabase initialization from config file
            if (typeof _supabase === 'undefined') {
                alert('Connection Error: Please ensure Supabase credentials are valid in config.');
                return;
            }

            // Retrieve and validate Turnstile CAPTCHA response
            const turnstileToken = typeof turnstile !== 'undefined' ? turnstile.getResponse() : null;
            if (!turnstileToken) {
                alert('Please complete the CAPTCHA security check to verify you are human.');
                return;
            }

            // Validate phone number to ensure it has enough digits beyond the pre-filled country code
            const phoneInputVal = quoteForm.querySelector('input[name="phone"]').value.trim();
            const phoneDigits = phoneInputVal.replace(/[^0-9]/g, '');
            if (phoneDigits.length < 8) {
                alert('Please enter your complete phone number (with country code).');
                return;
            }

            try {
                // Visual Loading State
                submitBtn.disabled = true;
                submitBtn.innerHTML = `
                    <span class="flex items-center justify-center gap-2">
                        <svg class="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Securing Request...
                    </span>
                `;

                const formData = new FormData(quoteForm);
                const payload = {
                    name: formData.get('name'),
                    phone: formData.get('phone'),
                    email: formData.get('email'),
                    from_location: formData.get('from_location'),
                    to_location: formData.get('to_location'),
                    service: formData.get('service'),
                    token: turnstileToken
                };

                // Invoke Supabase Edge Function to securely process the captcha and insert lead
                const { data, error } = await _supabase.functions.invoke('submit-lead', {
                    body: payload
                });

                if (error) throw error;

                // Success redirect
                const redirectPath = window.location.pathname.includes('/zone/') ? '../thank-you' : 'thank-you';
                window.location.href = redirectPath;

            } catch (error) {
                console.error('Critical Dispatch Error:', error);
                
                // Show a helpful error message to the user
                let errorMessage = 'Unable to reach dispatch servers. Please use the WhatsApp Hotline for immediate help.';
                if (error && error.message) {
                    errorMessage = `Submission failed: ${error.message}. Please retry or use WhatsApp.`;
                }
                alert(errorMessage);
                
                // Reset Turnstile CAPTCHA widget on error so they can try again
                if (typeof turnstile !== 'undefined') {
                    turnstile.reset();
                }

                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }

    // --- 5. CAROUSEL AUTO-SLIDE ENGINE ---
    function initAutoSlide(carouselId, intervalTime = 4000) {
        const carousel = document.getElementById(carouselId);
        if (!carousel) return;

        let isPaused = false;
        const autoSlide = () => {
            if (isPaused || document.hidden) return;
            const maxScroll = carousel.scrollWidth - carousel.clientWidth;
            const firstCard = carousel.querySelector(':scope > div');
            if (!firstCard) return;

            const step = firstCard.offsetWidth + 24;
            if (carousel.scrollLeft >= maxScroll - 10) {
                carousel.scrollTo({ left: 0, behavior: 'smooth' });
            } else {
                carousel.scrollBy({ left: step, behavior: 'smooth' });
            }
        };

        setInterval(autoSlide, intervalTime);
        carousel.addEventListener('mouseenter', () => isPaused = true);
        carousel.addEventListener('mouseleave', () => isPaused = false);
    }

    initAutoSlide('testimonial-carousel', 3500);
    initAutoSlide('services-carousel', 4500);

    // --- 6. IP-BASED PHONE COUNTRY CODE AUTO-DETECTION ---
    const phoneInput = document.querySelector('input[name="phone"]');
    if (phoneInput) {
        fetch('https://ipapi.co/json/')
            .then(res => {
                if (!res.ok) throw new Error('API response error');
                return res.json();
            })
            .then(data => {
                if (data && data.country_calling_code) {
                    const countryCode = data.country_calling_code;
                    phoneInput.value = countryCode;
                    phoneInput.placeholder = `${countryCode} Enter your number`;
                }
            })
            .catch(err => {
                console.warn('IP Geolocation failed, falling back to timezone/default:', err);
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                let defaultCode = '+91';
                if (tz && (tz.includes('Dubai') || tz.includes('Muscat') || tz.includes('Qatar') || tz.includes('Riyadh') || tz.includes('Asia/Aden'))) {
                    defaultCode = '+971';
                }
                phoneInput.value = defaultCode;
                phoneInput.placeholder = `${defaultCode} Enter your number`;
            });
    }

    console.log('Air Medical India - Production Engine Stable');
});