import type {
  CommunityPost,
  InterviewTemplate,
  PastInterview,
  ProgressStat,
  ReportData,
  ScheduledSession,
  User,
} from "@/data/mockData";

export const fallbackCurrentUser: User = {
  name: "Alex Chen",
  role: "Frontend Developer",
  avatar: "https://github.com/shadcn.png",
  level: "Mid-Senior",
};

export const fallbackInterviewTemplates: InterviewTemplate[] = [
  {
    id: "tech-round",
    title: "Tech Round",
    description: "React, System Design, and CSS mastery.",
    duration: "45 min",
    difficulty: "Hard",
    icon: "Code",
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    id: "aptitude-round",
    title: "Aptitude Round",
    description: "Logic puzzles and problem solving.",
    duration: "30 min",
    difficulty: "Medium",
    icon: "Brain",
    color: "bg-purple-500/10 text-purple-500",
  },
  {
    id: "hr-round",
    title: "HR Round",
    description: "Behavioral questions and culture fit.",
    duration: "30 min",
    difficulty: "Easy",
    icon: "Users",
    color: "bg-green-500/10 text-green-500",
  },
];

export const fallbackProgressStats: ProgressStat[] = [
  {
    label: "Confidence Score",
    value: 78,
    change: 12,
    history: [60, 65, 62, 70, 75, 78],
  },
  {
    label: "Technical Accuracy",
    value: 85,
    change: 5,
    history: [70, 75, 80, 82, 84, 85],
  },
  {
    label: "Communication",
    value: 92,
    change: 8,
    history: [80, 82, 85, 88, 90, 92],
  },
];

export const fallbackUpcomingSchedule: ScheduledSession[] = [
  {
    id: "1",
    title: "System Design Practice",
    date: new Date(Date.now() + 86400000).toISOString(),
    time: "10:00 AM",
    interviewer: "AI - Sarah (Tech Lead)",
  },
  {
    id: "2",
    title: "Behavioral Mock",
    date: new Date(Date.now() + 172800000).toISOString(),
    time: "2:00 PM",
    interviewer: "AI - Mike (HR Manager)",
  },
];

export const fallbackReport: ReportData = {
  id: "rep_123",
  date: new Date().toISOString(),
  overallScore: 82,
  duration: "42:15",
  hardSkillsScore: 85,
  softSkillsScore: 78,
  radarData: [
    { subject: "Technical", A: 85, fullMark: 100 },
    { subject: "Communication", A: 78, fullMark: 100 },
    { subject: "Problem Solving", A: 90, fullMark: 100 },
    { subject: "Confidence", A: 70, fullMark: 100 },
    { subject: "Cultural Fit", A: 88, fullMark: 100 },
  ],
  timelineData: [
    { time: "00:00", score: 70, sentiment: 65 },
    { time: "05:00", score: 75, sentiment: 70 },
    { time: "10:00", score: 85, sentiment: 80 },
    { time: "15:00", score: 80, sentiment: 75 },
    { time: "20:00", score: 90, sentiment: 85 },
    { time: "25:00", score: 88, sentiment: 82 },
    { time: "30:00", score: 75, sentiment: 70 },
    { time: "35:00", score: 82, sentiment: 78 },
    { time: "40:00", score: 85, sentiment: 80 },
  ],
  transcript: [
    {
      speaker: "Interviewer",
      text: "Let's start with a technical question. Can you explain the difference between useMemo and useCallback?",
      timestamp: "00:15",
    },
    {
      speaker: "You",
      text: "Sure. So, useMemo is used to cache the result of a calculation... um... basically a value. While useCallback is used to cache the function definition itself.",
      timestamp: "00:25",
    },
    {
      speaker: "Interviewer",
      text: "And when would you use one over the other?",
      timestamp: "00:45",
    },
    {
      speaker: "You",
      text: "Well, like, if you have a heavy computation, you use useMemo. If you're passing a callback to a child component that is wrapped in React.memo, you should use useCallback to prevent unnecessary re-renders.",
      timestamp: "00:55",
    },
    {
      speaker: "Interviewer",
      text: "Good. Now, how would you design a scalable notification system?",
      timestamp: "05:00",
    },
    {
      speaker: "You",
      text: "I would probably use a pub/sub model. Maybe Redis? Um, yeah, Redis for the queue. And then have workers that process the notifications.",
      timestamp: "05:15",
    },
  ],
  fillerWordsAnalysis: [
    { word: "um", count: 12 },
    { word: "like", count: 8 },
    { word: "basically", count: 5 },
    { word: "you know", count: 3 },
    { word: "actually", count: 4 },
  ],
  pacingAnalysis: [
    { time: "00:00", wpm: 120 },
    { time: "05:00", wpm: 145 },
    { time: "10:00", wpm: 130 },
    { time: "15:00", wpm: 160 },
    { time: "20:00", wpm: 140 },
    { time: "25:00", wpm: 125 },
    { time: "30:00", wpm: 135 },
    { time: "35:00", wpm: 150 },
    { time: "40:00", wpm: 130 },
  ],
  questions: [
    {
      id: 1,
      question: "Explain the difference between useMemo and useCallback.",
      userAnswerSummary:
        "Correctly identified that useMemo caches values and useCallback caches functions. Mentioned dependency arrays.",
      aiFeedback:
        "Great explanation of the core concepts. You could have added a practical example of when NOT to use them to show deeper understanding.",
      score: 90,
      improvements: ["Provide a code example", "Discuss performance overhead"],
      audioUrl: "/mock-audio-1.mp3",
    },
    {
      id: 2,
      question: "How would you design a scalable notification system?",
      userAnswerSummary:
        "Proposed a pub/sub model using Redis and a worker queue. Discussed database schema for storing notifications.",
      aiFeedback:
        "Solid architectural choice. However, you missed discussing how to handle user preferences and rate limiting.",
      score: 80,
      improvements: [
        "Mention rate limiting",
        "Discuss push notification services (FCM/APNS)",
      ],
      audioUrl: "/mock-audio-2.mp3",
    },
    {
      id: 3,
      question: "Tell me about a time you had a conflict with a coworker.",
      userAnswerSummary:
        "Shared a story about a disagreement on code style. Resolved it by creating a linting config.",
      aiFeedback:
        "Good use of the STAR method. The resolution was a bit technical; try to focus more on the interpersonal communication aspect.",
      score: 75,
      improvements: [
        "Focus on empathy",
        "Describe the conversation in more detail",
      ],
      audioUrl: "/mock-audio-3.mp3",
    },
  ],
  behavioralAnalysis: {
    eyeContact: "Good",
    fillerWords: "Moderate",
    pace: "Good",
    clarity: "High",
  },
  swot: {
    strengths: [
      "Strong understanding of React hooks",
      "Clear explanation of state management",
      "Good problem-solving approach",
    ],
    weaknesses: [
      "Overused 'um' and 'like' filler words",
      "Struggled with CSS Grid concepts",
      "Rushed through the system design conclusion",
    ],
    opportunities: [
      "Deepen knowledge of CSS layout algorithms",
      "Practice pausing instead of using fillers",
      "Learn more about scalable architecture patterns",
    ],
    threats: [
      "Competition has stronger system design skills",
      "Potential burnout from rapid pacing",
    ],
  },
  resources: [
    { title: "Mastering CSS Grid", type: "Article", url: "#" },
    { title: "System Design Interview Guide", type: "Video", url: "#" },
    { title: "Effective Communication for Engineers", type: "Course", url: "#" },
  ],
};

export const fallbackCommunityPosts: CommunityPost[] = [
  {
    id: "1",
    author: {
      name: "Sarah Jenkins",
      avatar: "https://i.pravatar.cc/150?u=sarah",
      role: "Product Manager",
    },
    content:
      "Just aced my PM interview at Google! The AI mock sessions really helped me structure my answers for the product design questions. Highly recommend practicing the 'Circle Method'.",
    likes: 42,
    comments: 12,
    timestamp: "2 hours ago",
    tags: ["Success Story", "Product Management", "Google"],
  },
  {
    id: "2",
    author: {
      name: "David Kim",
      avatar: "https://i.pravatar.cc/150?u=david",
      role: "Software Engineer",
    },
    content:
      "Anyone else finding the System Design templates a bit too hard? I'm struggling with the database sharding section. Any tips?",
    likes: 15,
    comments: 8,
    timestamp: "5 hours ago",
    tags: ["System Design", "Help Needed", "Backend"],
  },
  {
    id: "3",
    author: {
      name: "Emily Chen",
      avatar: "https://i.pravatar.cc/150?u=emily",
      role: "UX Designer",
    },
    content:
      "Created a custom template for Whiteboard Challenges. It focuses on user empathy and rapid prototyping. Feel free to try it out!",
    likes: 89,
    comments: 24,
    timestamp: "1 day ago",
    tags: ["Template", "UX Design", "Whiteboard"],
  },
];

export const fallbackPastInterviews: PastInterview[] = [
  {
    id: "1",
    title: "Frontend React Deep Dive",
    date: "2024-03-15",
    duration: "45:00",
    score: 85,
    type: "Technical",
  },
  {
    id: "2",
    title: "Behavioral & Leadership",
    date: "2024-03-12",
    duration: "30:00",
    score: 72,
    type: "HR",
  },
  {
    id: "3",
    title: "System Design Basics",
    date: "2024-03-10",
    duration: "60:00",
    score: 65,
    type: "Technical",
  },
  {
    id: "4",
    title: "Algorithm Challenge",
    date: "2024-03-05",
    duration: "40:00",
    score: 90,
    type: "Technical",
  },
];
