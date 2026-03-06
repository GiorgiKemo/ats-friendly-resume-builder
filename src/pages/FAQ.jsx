import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';

const FAQ = () => {
  const [openQuestion, setOpenQuestion] = useState(null);

  const toggleQuestion = (index) => {
    if (openQuestion === index) {
      setOpenQuestion(null);
    } else {
      setOpenQuestion(index);
    }
  };

  const faqs = [
    {
      question: "What exactly is an \"ATS-friendly\" resume?",
      answer: "An ATS-friendly resume is structured and formatted so Applicant Tracking Systems (ATS) – software used by most employers to screen job applications – can accurately read and understand its content. Key elements include clear, standard formatting, relevant keywords from the job description, and avoidance of complex elements like tables, images, or non-standard fonts that can hinder ATS parsing."
    },
    {
      question: "How does ResumeATS ensure my resume gets past ATS screeners?",
      answer: "ResumeATS is built from the ground up with ATS compatibility in mind. We offer professionally designed templates that adhere to strict ATS guidelines (clear layouts, standard fonts, correct sectioning). Our tools also guide you in integrating crucial keywords from job descriptions and help you avoid common formatting pitfalls that can get your resume rejected by an ATS before a human even sees it."
    },
    {
      question: "What does the AI Resume Generator do, and how can it help me?",
      answer: "Our AI Resume Generator (a Premium feature) is like having a professional resume writer on demand. It intelligently analyzes your target job description, career level, and other inputs to craft compelling, keyword-rich content for your resume sections. It can generate relevant (though fictional, as a starting point) work experiences demonstrating career progression, highlight key competencies, and even adapt to regional nuances based on location inputs. This gives you a powerful, ATS-optimized draft to then personalize with your unique achievements."
    },
    {
      question: "What are the limits of the Basic (Free) plan regarding resume creation?",
      answer: "Our Basic (Free) plan allows you to create and store up to 3 distinct resumes. This is great for getting started or targeting a few specific roles. For unlimited resume creation and storage, plus access to our advanced AI features, consider upgrading to Premium."
    },
    {
      question: "What file formats can I export my resume in?",
      answer: "You can export your completed resumes in both PDF (.pdf) and Microsoft Word (.docx) formats. For most job applications, PDF is the preferred format as it ensures your layout and design are preserved perfectly across all devices and systems."
    },
    {
      question: "How can ResumeATS help me tailor my resume for a specific job?",
      answer: "Our Premium AI+ plan features an AI Resume Generator specifically designed for this. By inputting the job description, the AI crafts content with relevant keywords and phrases that employers and ATS software look for. This ensures your resume is highly targeted. (We're also excited about an upcoming advanced keyword analysis tool to further enhance this!)."
    },
    {
      question: "How do you protect my personal information?",
      answer: "Your privacy and data security are paramount at ResumeATS. We employ robust, industry-standard encryption and security protocols to safeguard all your personal information. We are committed to ethical data practices and never sell your data to third parties. For a comprehensive overview, please see our detailed Privacy Policy."
    },
    {
      question: "What's the cancellation policy for Premium subscriptions?",
      answer: "We believe in flexibility. You can cancel your Premium AI+ subscription at any point directly via your account settings. There are no long-term commitments. Your Premium access will continue until the end of your current paid billing cycle, and your subscription will not auto-renew thereafter."
    },
    {
      question: "What support is available if I need help building my resume?",
      answer: "We're here to support you! Our platform includes helpful guides and contextual tips as you build your resume. Premium AI+ users benefit from more in-depth AI-driven suggestions and guidance. For any specific questions or technical assistance, our dedicated support team is just a message away via our Contact page."
    },
    {
      question: "When is the best time to update my resume?",
      answer: "Keep your resume fresh! We advise updating it whenever you acquire new skills, complete a significant project, transition jobs, or achieve a noteworthy accomplishment. Crucially, always tailor your resume for each specific job application to emphasize the most relevant qualifications and experiences for that particular role."
    },
    {
      question: "Is ResumeATS accessible on mobile devices?",
      answer: "Absolutely! ResumeATS is designed to be fully responsive, offering a seamless experience whether you're on a desktop, tablet, or smartphone. You can conveniently create, edit, and download your resumes from any device with internet access."
    },
    {
      question: "What is your refund policy for Premium plans?",
      answer: "Your satisfaction is important to us. We offer a 7-day money-back guarantee for all new Premium AI+ subscriptions. If you find that our Premium service isn't the right fit for you within the first week, simply contact our support team to request a full refund."
    }
  ];

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Your Questions, Answered by ResumeATS</h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Get quick answers to your most common questions about creating ATS-friendly resumes, using our AI tools, managing your account, and more.
        </p>
      </div>

      {/* Search Bar (for future implementation) */}
      <div className="mb-12">
        <div className="relative max-w-2xl mx-auto">
          <label htmlFor="faq-search" className="sr-only">Search frequently asked questions</label>
          <input
            id="faq-search"
            type="text"
            placeholder={'Ask us anything... (e.g., "ATS format", "AI generator", "cancel subscription")'}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button className="absolute right-3 top-3 text-gray-400" aria-label="Search">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* FAQ Accordion */}
      <div className="space-y-4 mb-12">
        {faqs.map((faq, index) => (
          <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              className="w-full px-6 py-4 text-left bg-white hover:bg-gray-50 flex justify-between items-center focus:outline-none"
              onClick={() => toggleQuestion(index)}
              aria-expanded={openQuestion === index}
            >
              <span className="font-medium text-gray-900">{faq.question}</span>
              <svg
                className={`h-5 w-5 text-gray-500 transform ${openQuestion === index ? 'rotate-180' : ''} transition-transform duration-200`}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <div
              className={`px-6 py-4 bg-gray-50 transition-all duration-200 ease-in-out ${openQuestion === index ? 'block' : 'hidden'
                }`}
            >
              <p className="text-gray-700">{faq.answer}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Still Have Questions Section */}
      <div className="bg-blue-50 rounded-lg p-8 text-center">
        <h2 className="text-2xl font-bold mb-4">Didn't Find Your Answer?</h2>
        <p className="text-lg text-gray-700 mb-6">
          If your question isn't covered above, our friendly support team is ready to assist. Don't hesitate to reach out!
        </p>
        <Link to="/contact">
          <Button variant="primary">Get in Touch with Us</Button>
        </Link>
      </div>
    </div>
  );
};

export default FAQ;
