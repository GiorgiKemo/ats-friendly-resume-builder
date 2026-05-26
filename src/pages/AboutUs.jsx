import React from 'react';
import { motion } from 'framer-motion';
import { TouchLink, PageHero } from '../components/ui';
import AnimatedElement from '../components/ui/AnimatedElement';
import StaggeredContainer from '../components/ui/StaggeredContainer';
import StaggeredItem from '../components/ui/StaggeredItem';
import { fadeInUp } from '../utils/animationVariants';

const team = [
  {
    name: 'Giorgi Kemoklidze',
    role: 'CEO',
    bio: 'A 15+ year veteran in HR and talent acquisition, Giorgi brings deep insider knowledge of what makes a resume truly stand out to hiring managers.',
  },
  {
    name: 'Michael Chen',
    role: 'Co-Founder & CTO',
    bio: 'Michael is the AI and machine learning architect who ensures our technology is not just smart, but also intuitively solves the real-world challenges job seekers face.',
  },
  {
    name: 'Emily Rodriguez',
    role: 'Head of Product',
    bio: 'Emily, our resident career coach and resume guru, translates her experience helping hundreds achieve career growth into practical, actionable strategies within our platform.',
  },
];

const values = [
  {
    title: 'Innovation',
    body: 'Your success is our benchmark. We relentlessly innovate, ensuring our AI and tools are always a step ahead, giving you the edge in an ever-changing job market.',
    path: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  {
    title: 'Accessibility',
    body: "Career opportunities shouldn't have barriers. We're committed to making our powerful resume tools intuitive and accessible to everyone, empowering all job seekers to shine.",
    path: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    title: 'Integrity',
    body: 'Your trust is paramount. We operate with unwavering integrity, ensuring transparent practices and clear communication, so you can confidently navigate your job search with us.',
    path: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
  {
    title: 'Empowerment',
    body: "We're more than just a resume builder; we're your career ally. We equip you with the tools, knowledge, and confidence to take command of your job search and achieve your professional ambitions.",
    path: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
  },
];

const cardClass =
  'rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm transition-shadow duration-200 ease-out hover:shadow-md sm:p-8 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-900/40';

const AboutUs = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <PageHero
        eyebrow="About ResumeATS"
        title="Empowering your career journey."
        lead="At ResumeATS we're passionate about leveling the playing field for job seekers. We understand the frustration of crafting the perfect resume only to have it filtered out by automated systems. We built a smarter way to get your qualifications noticed."
        titleId="about-page-title"
      />

      <div className="app-page max-w-5xl space-y-10 sm:space-y-14">
        <AnimatedElement variants={fadeInUp} delay={0.05}>
          <section>
            <h2 className="mb-5 text-2xl font-bold sm:text-3xl">The Spark Behind ResumeATS</h2>
            <div className={cardClass}>
              <div className="space-y-4 text-gray-700 dark:text-slate-300">
                <p>
                  ResumeATS was born from a shared frustration. As HR veterans and tech innovators, we repeatedly saw talented individuals overlooked simply because their resumes weren&apos;t &apos;ATS-friendly.&apos; We knew there had to be a better way.
                </p>
                <p>
                  Driven by the belief that everyone deserves a fair chance, we pooled our expertise in recruitment, HR technology, and artificial intelligence. Our goal: to dismantle the barriers created by automated screening and empower job seekers.
                </p>
                <p>
                  The result is ResumeATS — a platform that blends deep ATS understanding with intelligent AI. We&apos;re dedicated to helping you craft resumes that not only satisfy the algorithms but also compellingly tell your unique professional story to human decision-makers.
                </p>
              </div>
            </div>
          </section>
        </AnimatedElement>

        <AnimatedElement variants={fadeInUp} delay={0.05}>
          <section>
            <h2 className="mb-5 text-2xl font-bold sm:text-3xl">Our Guiding Mission</h2>
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-blue-50 to-indigo-50 p-8 text-center shadow-sm sm:p-10 dark:border-blue-500/20 dark:from-blue-500/10 dark:via-blue-500/5 dark:to-indigo-500/10">
              <p className="mx-auto max-w-3xl text-lg font-medium leading-relaxed text-gray-800 dark:text-slate-100 sm:text-xl">
                &ldquo;To democratize career opportunities by providing every job seeker with intelligent tools and expert insights, transforming the resume from a hurdle into a powerful key that unlocks their dream job.&rdquo;
              </p>
            </div>
          </section>
        </AnimatedElement>

        <AnimatedElement variants={fadeInUp} delay={0.05}>
          <section>
            <h2 className="mb-5 text-2xl font-bold sm:text-3xl">Meet the Experts Behind Your Success</h2>
            <StaggeredContainer
              className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              staggerDelay={0.1}
              initialDelay={0.1}
            >
              {team.map((member) => (
                <StaggeredItem key={member.name}>
                  <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm transition-shadow duration-200 ease-out hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-900/40">
                    <div className="flex h-40 items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 transition-colors dark:from-slate-700 dark:to-slate-700/60">
                      <svg
                        className="h-20 w-20 text-blue-300 dark:text-slate-500"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg>
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <h3 className="text-lg font-bold sm:text-xl">{member.name}</h3>
                      <p className="mb-3 text-sm font-medium text-blue-700 dark:text-blue-300">{member.role}</p>
                      <p className="text-sm text-gray-700 dark:text-slate-300">{member.bio}</p>
                    </div>
                  </article>
                </StaggeredItem>
              ))}
            </StaggeredContainer>
          </section>
        </AnimatedElement>

        <AnimatedElement variants={fadeInUp} delay={0.05}>
          <section>
            <h2 className="mb-5 text-2xl font-bold sm:text-3xl">The Principles That Drive Us</h2>
            <StaggeredContainer
              className="grid gap-6 sm:grid-cols-2"
              staggerDelay={0.1}
              initialDelay={0.1}
            >
              {values.map((value) => (
                <StaggeredItem key={value.title}>
                  <article className={`${cardClass} h-full`}>
                    <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={value.path} />
                      </svg>
                    </div>
                    <h3 className="mb-2 text-lg font-semibold sm:text-xl">{value.title}</h3>
                    <p className="text-gray-600 dark:text-slate-400">{value.body}</p>
                  </article>
                </StaggeredItem>
              ))}
            </StaggeredContainer>
          </section>
        </AnimatedElement>

        <AnimatedElement variants={fadeInUp} delay={0.05}>
          <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 p-8 text-center shadow-lg sm:p-10">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Inspired by our story? Start yours.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-blue-100 sm:text-lg">
              Now that you know us, let us help you make your next career move. Leverage our expertise and smart resume tools to craft a resume that opens doors.
            </p>
            <div className="mt-6 flex justify-center">
              <TouchLink
                to="/builder"
                className="inline-flex min-h-[3rem] items-center justify-center rounded-xl bg-white px-7 text-base font-semibold text-blue-700 shadow-md transition-transform hover:scale-[1.02] hover:bg-gray-50"
                ariaLabel="Build your resume now"
              >
                Create your winning resume
              </TouchLink>
            </div>
          </section>
        </AnimatedElement>
      </div>
    </motion.div>
  );
};

export default AboutUs;
