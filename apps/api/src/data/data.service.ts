import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Default data for when database is empty
const defaultUser = {
  id: 1,
  name: 'Alex Rivera',
  role: 'Senior Software Engineer',
  avatar: 'https://i.pravatar.cc/150?u=alex',
  level: 'Pro',
};

const defaultInterviewTemplates = [
  {
    id: 'behavioral-general',
    title: 'Behavioral: General',
    description:
      'Practice common behavioral questions like "Tell me about yourself" and situational scenarios.',
    duration: '30-45 min',
    difficulty: 'Beginner',
    icon: 'Users',
    color: 'bg-blue-500',
  },
  {
    id: 'tech-system-design',
    title: 'Tech: System Design',
    description: 'Deep dive into system design concepts and architectural patterns.',
    duration: '45-60 min',
    difficulty: 'Advanced',
    icon: 'Cpu',
    color: 'bg-purple-500',
  },
  {
    id: 'tech-algorithms',
    title: 'Tech: Algorithms & DS',
    description: 'Practice data structures and algorithm problems with live coding.',
    duration: '45 min',
    difficulty: 'Intermediate',
    icon: 'Code',
    color: 'bg-green-500',
  },
  {
    id: 'leadership-management',
    title: 'Leadership & Management',
    description: 'Questions focused on leadership experience and management scenarios.',
    duration: '30-45 min',
    difficulty: 'Intermediate',
    icon: 'Briefcase',
    color: 'bg-orange-500',
  },
];

const defaultProgressStats = [
  { label: 'Sessions Completed', value: 12, change: 3, history: [8, 10, 9, 11, 12] },
  { label: 'Average Score', value: 85, change: 5, history: [78, 80, 82, 83, 85] },
  { label: 'Hours Practiced', value: 24, change: 8, history: [12, 15, 18, 20, 24] },
  { label: 'Streak Days', value: 7, change: 2, history: [3, 4, 5, 5, 7] },
];

const defaultSchedule = [
  {
    id: 'session-1',
    title: 'System Design Mock',
    date: 'Today',
    time: '3:00 PM',
    interviewer: 'Sarah Chen',
  },
  {
    id: 'session-2',
    title: 'Behavioral Practice',
    date: 'Tomorrow',
    time: '10:00 AM',
    interviewer: 'AI Coach',
  },
];

const defaultReportLatest = {
  id: 'report-latest',
  date: '2024-01-15',
  overallScore: 85,
  duration: '45:30',
  hardSkillsScore: 88,
  softSkillsScore: 82,
  radarData: [
    { subject: 'Communication', A: 85 },
    { subject: 'Technical', A: 88 },
    { subject: 'Problem Solving', A: 82 },
    { subject: 'Leadership', A: 78 },
    { subject: 'Adaptability', A: 80 },
  ],
  timelineData: [
    { time: '0:00', engagement: 70, confidence: 65 },
    { time: '10:00', engagement: 80, confidence: 75 },
    { time: '20:00', engagement: 85, confidence: 82 },
    { time: '30:00', engagement: 78, confidence: 80 },
    { time: '45:00', engagement: 90, confidence: 88 },
  ],
  fillerWordsAnalysis: [
    { word: 'um', count: 12, percentage: 40 },
    { word: 'like', count: 8, percentage: 27 },
    { word: 'you know', count: 6, percentage: 20 },
    { word: 'so', count: 4, percentage: 13 },
  ],
  pacingAnalysis: [
    { segment: 'Intro', wpm: 145, ideal: 150 },
    { segment: 'Technical', wpm: 165, ideal: 150 },
    { segment: 'Behavioral', wpm: 140, ideal: 150 },
    { segment: 'Q&A', wpm: 155, ideal: 150 },
  ],
  behavioralAnalysis: {
    confidence: { score: 82, trend: 'up' },
    clarity: { score: 85, trend: 'stable' },
    enthusiasm: { score: 78, trend: 'up' },
    professionalism: { score: 90, trend: 'stable' },
  },
  swot: {
    strengths: [
      'Strong technical explanations',
      'Good use of STAR method',
      'Confident body language',
    ],
    weaknesses: ['Occasional filler words', 'Could improve pacing in technical sections'],
    opportunities: ['Practice more system design', 'Work on concise answers'],
    threats: ['May rush when nervous', 'Complex questions need more structure'],
  },
  resources: [
    {
      title: 'STAR Method Deep Dive',
      type: 'article',
      url: '#',
      description: 'Master behavioral questions with the STAR framework',
    },
    {
      title: 'System Design Basics',
      type: 'video',
      url: '#',
      description: 'Learn scalable system design patterns',
    },
  ],
  questions: [
    {
      id: 1,
      question: 'Tell me about a time you led a challenging project',
      userAnswerSummary:
        'Discussed leading a migration project with tight deadlines and cross-team coordination.',
      aiFeedback:
        'Great use of STAR method. Consider adding more specific metrics about the impact.',
      score: 88,
      improvements: ['Add quantifiable outcomes', 'Mention team size explicitly'],
    },
    {
      id: 2,
      question: 'How would you design a URL shortening service?',
      userAnswerSummary:
        'Covered hashing strategies, database choices, and caching considerations.',
      aiFeedback: 'Strong technical depth. Could improve by discussing failure scenarios.',
      score: 85,
      improvements: ['Discuss failure modes', 'Consider rate limiting'],
    },
  ],
  transcripts: [
    { speaker: 'Interviewer', text: 'Thank you for joining us today.', timestamp: '0:00' },
    { speaker: 'You', text: 'Thank you for having me. I am excited to be here.', timestamp: '0:05' },
  ],
};

const defaultCommunityPosts = [
  {
    id: 'post-1',
    author: { name: 'Jennifer K.', avatar: 'https://i.pravatar.cc/150?u=jennifer' },
    content:
      'Just passed my Meta interview! The AI coach was super helpful for behavioral prep.',
    likes: 24,
    comments: 5,
    timestamp: '2h ago',
    tags: ['Success Story', 'Meta'],
  },
  {
    id: 'post-2',
    author: { name: 'Mark T.', avatar: 'https://i.pravatar.cc/150?u=mark' },
    content: 'Anyone have tips for system design interviews at startups vs big tech?',
    likes: 18,
    comments: 12,
    timestamp: '5h ago',
    tags: ['Question', 'System Design'],
  },
];

const defaultPastInterviews = [
  { id: 'int-1', title: 'System Design: URL Shortener', date: '2024-01-10', duration: '45 min', score: 88, type: 'Tech' },
  { id: 'int-2', title: 'Behavioral: Leadership', date: '2024-01-08', duration: '35 min', score: 82, type: 'Behavioral' },
  { id: 'int-3', title: 'Tech: React Deep Dive', date: '2024-01-05', duration: '50 min', score: 90, type: 'Tech' },
];

@Injectable()
export class DataService {
  private userData = { ...defaultUser };
  private scheduleData = [...defaultSchedule];

  constructor(private prisma: PrismaService) {}

  async getUser() {
    try {
      const user = await this.prisma.user.findFirst();
      return user || this.userData;
    } catch {
      return this.userData;
    }
  }

  async updateUser(data: typeof defaultUser) {
    this.userData = { ...this.userData, ...data };
    return this.userData;
  }

  async getInterviewTemplates() {
    try {
      const templates = await this.prisma.interviewTemplate.findMany();
      return templates.length > 0 ? templates : defaultInterviewTemplates;
    } catch {
      return defaultInterviewTemplates;
    }
  }

  async getProgressStats() {
    try {
      const stats = await this.prisma.progressStat.findMany();
      return stats.length > 0 ? stats : defaultProgressStats;
    } catch {
      return defaultProgressStats;
    }
  }

  async getSchedule() {
    try {
      const schedule = await this.prisma.scheduledSession.findMany();
      return schedule.length > 0 ? schedule : this.scheduleData;
    } catch {
      return this.scheduleData;
    }
  }

  async createScheduledSession(data: Omit<typeof defaultSchedule[0], 'id'>) {
    const newSession = {
      id: `session-${Date.now()}`,
      ...data,
    };
    this.scheduleData.push(newSession);
    return newSession;
  }

  async getLatestReport() {
    try {
      const report = await this.prisma.report.findFirst({
        include: {
          questions: true,
          transcripts: true,
        },
        orderBy: { date: 'desc' },
      });
      return report || defaultReportLatest;
    } catch {
      return defaultReportLatest;
    }
  }

  async getCommunityPosts() {
    try {
      const posts = await this.prisma.communityPost.findMany();
      return posts.length > 0 ? posts : defaultCommunityPosts;
    } catch {
      return defaultCommunityPosts;
    }
  }

  async getPastInterviews() {
    try {
      const interviews = await this.prisma.pastInterview.findMany();
      return interviews.length > 0 ? interviews : defaultPastInterviews;
    } catch {
      return defaultPastInterviews;
    }
  }
}
