"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";

interface UXReviewCarouselProps {
  screens: string[];
}

interface PersonaReview {
  personaName: string;
  personaDescription: string;
  screenName: string;
  feedback: string;
  painPoints: string[];
  satisfaction: "low" | "medium" | "high";
}

const personas = [
  {
    name: "Tech-Savvy User",
    description: "Experienced with mobile apps, expects efficiency",
  },
  {
    name: "First-Time User",
    description: "New to the app, needs clear guidance",
  },
  {
    name: "Accessibility User",
    description: "Relies on assistive technologies",
  },
];

export function UXReviewCarousel({ screens }: UXReviewCarouselProps) {
  const safeScreens = screens.length > 0 ? screens : ["Screen 1"];
  const [currentIndex, setCurrentIndex] = useState(0);

  const slides: PersonaReview[] = [
    ...safeScreens.map((screenName, index) => {
      const persona = personas[index % personas.length];
      return {
        personaName: persona.name,
        personaDescription: persona.description,
        screenName: screenName || `Screen ${index + 1}`,
        feedback: `As a ${persona.name.toLowerCase()}, the ${screenName || `screen ${index + 1}`} provides a ${index % 2 === 0 ? "smooth" : "somewhat confusing"} experience. The navigation is ${index % 3 === 0 ? "intuitive" : "could be clearer"} and the visual hierarchy ${index % 2 === 0 ? "guides attention effectively" : "needs improvement"}.`,
        painPoints:
          index % 2 === 0
            ? [
                "Loading time could be reduced",
                "Text size might be small for some users",
              ]
            : [
                "Call-to-action not immediately visible",
                "Too many options presented at once",
                "Back navigation unclear",
              ],
        satisfaction: (index % 3 === 0
          ? "high"
          : index % 3 === 1
            ? "medium"
            : "low") as "low" | "medium" | "high",
      };
    }),
    {
      personaName: "Summary",
      personaDescription: "Aggregate feedback across all personas",
      screenName: "Overall UX Assessment",
      feedback:
        "The flow demonstrates good usability for experienced users but may present challenges for newcomers. Key areas for improvement include onboarding guidance, clearer CTAs, and accessibility enhancements. The overall user satisfaction trend is positive with room for optimization.",
      painPoints: [
        "Onboarding could be more comprehensive",
        "Consider adding tooltips for complex actions",
        "Improve error state messaging",
        "Add progress indicators for multi-step processes",
      ],
      satisfaction: "medium" as const,
    },
  ];

  const currentSlide = slides[currentIndex];

  const goToPrev = () => setCurrentIndex((prev) => Math.max(0, prev - 1));
  const goToNext = () =>
    setCurrentIndex((prev) => Math.min(slides.length - 1, prev + 1));

  const satisfactionColors = {
    low: "bg-destructive/10 text-destructive border-destructive/20",
    medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    high: "bg-green-500/10 text-green-600 border-green-500/20",
  } as const;

  const satisfactionLabels = {
    low: "Low Satisfaction",
    medium: "Medium Satisfaction",
    high: "High Satisfaction",
  } as const;

  return (
    <div className="flex flex-col">
      {/* Navigation controls */}
      <div className="flex items-center justify-center gap-4 mb-3">
        <button
          onClick={goToPrev}
          disabled={currentIndex === 0}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors duration-fast"
        >
          &lt;&lt;
        </button>
        <span className="text-sm font-medium text-foreground">
          {currentIndex + 1} of {slides.length}
        </span>
        <button
          onClick={goToNext}
          disabled={currentIndex === slides.length - 1}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors duration-fast"
        >
          &gt;&gt;
        </button>
      </div>

      {/* Slide content */}
      <motion.div
        key={currentIndex}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        transition={{ duration: 0.2 }}
        className="border-2 border-border rounded-lg p-4 flex flex-col gap-3"
      >
        {/* Persona header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <User className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <span className="text-sm font-medium text-foreground">
                {currentSlide.personaName}
              </span>
              <p className="text-xs text-muted-foreground">
                {currentSlide.personaDescription}
              </p>
            </div>
          </div>
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded border",
              satisfactionColors[currentSlide.satisfaction],
            )}
          >
            {satisfactionLabels[currentSlide.satisfaction]}
          </span>
        </div>

        <h3 className="text-base font-medium text-foreground">
          {currentSlide.screenName}
        </h3>

        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Persona Feedback:
          </span>
          <p className="text-sm text-foreground leading-relaxed">
            {currentSlide.feedback}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Pain Points:
          </span>
          <ul className="text-sm text-foreground space-y-1">
            {currentSlide.painPoints.map((point, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-destructive mt-0.5">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 mt-3">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-colors duration-fast",
              index === currentIndex
                ? "bg-primary"
                : "bg-muted-foreground/30 hover:bg-muted-foreground/50",
            )}
          />
        ))}
      </div>
    </div>
  );
}
