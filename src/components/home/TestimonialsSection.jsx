import React from 'react';
import { motion } from 'framer-motion';
import AnimatedElement from '../ui/AnimatedElement';
import { fadeInUp } from '../../utils/animationVariants';

const TestimonialCard = ({ quote, author, position, company }) => (
  <motion.div
    className="bg-white p-6 rounded-lg shadow-md"
    whileHover={{ y: -5, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
    transition={{ duration: 0.3 }}
  >
    <svg className="h-8 w-8 text-blue-500 mb-4" fill="currentColor" viewBox="0 0 32 32">
      <path d="M9.352 4C4.456 7.456 1 13.12 1 19.36c0 5.088 3.072 8.064 6.624 8.064 3.36 0 5.856-2.688 5.856-5.856 0-3.168-2.208-5.472-5.088-5.472-.576 0-1.344.096-1.536.192.48-3.264 3.552-7.104 6.624-9.024L9.352 4zm16.512 0c-4.8 3.456-8.256 9.12-8.256 15.36 0 5.088 3.072 8.064 6.624 8.064 3.264 0 5.856-2.688 5.856-5.856 0-3.168-2.304-5.472-5.184-5.472-.576 0-1.248.096-1.44.192.48-3.264 3.456-7.104 6.528-9.024L25.864 4z" />
    </svg>
    <p className="italic text-gray-600 mb-4">{quote}</p>
    <div>
      <p className="font-semibold">{author}</p>
      <p className="text-sm text-gray-500">{position}, {company}</p>
    </div>
  </motion.div>
);

const TestimonialsSection = () => {
  const testimonials = [
    {
      quote: "I was able to land three interviews within a week after optimizing my resume with this tool. The AI suggestions were spot-on for my industry.",
      author: "Sarah Johnson",
      position: "Senior Developer",
      company: "Tech Innovations"
    },
    {
      quote: "As someone who struggled with writing about my accomplishments, the AI-generated content made it so much easier to highlight my strengths.",
      author: "Michael Chen",
      position: "Marketing Specialist",
      company: "Brand Forward"
    },
    {
      quote: "The ATS optimization feature helped me understand why my previous resumes weren't getting through. Now I'm getting responses from companies I apply to.",
      author: "Alex Rodriguez",
      position: "Project Manager",
      company: "Construct Solutions"
    }
  ];

  return (
    <div className="py-16 bg-blue-50">
      <div className="container mx-auto px-4 max-w-6xl">
        <AnimatedElement variants={fadeInUp}>
          <h2 className="text-3xl font-bold text-center mb-4">Success Stories from Job Seekers Like You</h2>
          <p className="text-center text-gray-600 mb-12 max-w-3xl mx-auto">
            Discover how our AI resume builder has helped thousands of professionals get noticed, secure interviews, and advance their careers.
          </p>
        </AnimatedElement>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <TestimonialCard
              key={index}
              quote={testimonial.quote}
              author={testimonial.author}
              position={testimonial.position}
              company={testimonial.company}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TestimonialsSection;
