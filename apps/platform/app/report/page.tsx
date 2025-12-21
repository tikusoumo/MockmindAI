
"use client";

import { useState, useEffect } from "react";
import { 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  BookOpen, 
  Video, 
  GraduationCap,
  Share2,
  Download,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Play,
  MessageSquare,
  Mic,
  Activity,
  Clock,
  User,
  Bot
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { mockReport } from "@/data/mockData";
import { cn } from "@/lib/utils";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend
} from 'recharts';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

export default function ReportPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);

  useEffect(() => {
    // Simulate analysis delay
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interview Analysis</h1>
          <p className="text-muted-foreground mt-1">
            Session ID: {mockReport.id} • {new Date(mockReport.date).toLocaleDateString()} • {mockReport.duration}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="hidden md:flex">
            <MessageSquare className="mr-2 h-4 w-4" /> Ask Coach
          </Button>
          <Button variant="outline">
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
          <Button>
            <Download className="mr-2 h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Score Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overall Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-primary">{mockReport.overallScore}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <Progress value={mockReport.overallScore} className="h-2 mt-3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Hard Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{mockReport.hardSkillsScore}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <Progress value={mockReport.hardSkillsScore} className="h-2 mt-3 bg-muted" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Soft Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{mockReport.softSkillsScore}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <Progress value={mockReport.softSkillsScore} className="h-2 mt-3 bg-muted" />
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Skills Breakdown</CardTitle>
            <CardDescription>Detailed analysis of your competencies</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={mockReport.radarData}>
                <PolarGrid stroke="#333" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#888', fontSize: 12 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="You"
                  dataKey="A"
                  stroke="#8884d8"
                  fill="#8884d8"
                  fillOpacity={0.6}
                />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance Timeline</CardTitle>
            <CardDescription>Score and sentiment fluctuation over time</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={mockReport.timelineData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSentiment" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="time" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="score" 
                  stroke="#3b82f6" 
                  strokeWidth={2} 
                  fillOpacity={1} 
                  fill="url(#colorScore)" 
                  name="Technical Score" 
                />
                <Area 
                  type="monotone" 
                  dataKey="sentiment" 
                  stroke="#f43f5e" 
                  strokeWidth={2} 
                  fillOpacity={1} 
                  fill="url(#colorSentiment)" 
                  name="Confidence" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analysis Tabs */}
      <Tabs defaultValue="questions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="questions">Question Analysis</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="speech">Speech Analysis</TabsTrigger>
          <TabsTrigger value="swot">SWOT Analysis</TabsTrigger>
          <TabsTrigger value="behavioral">Behavioral</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="space-y-4">
          {mockReport.questions.map((q) => (
            <Card key={q.id} className="overflow-hidden">
              <Collapsible 
                open={openQuestion === q.id} 
                onOpenChange={(isOpen) => setOpenQuestion(isOpen ? q.id : null)}
              >
                <CollapsibleTrigger className="flex w-full items-center justify-between p-6 hover:bg-muted/50 data-[state=open]:bg-muted/50 transition-colors text-left">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={q.score >= 80 ? "default" : q.score >= 60 ? "secondary" : "destructive"}>
                        {q.score}/100
                      </Badge>
                      <h3 className="font-semibold text-lg">{q.question}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {q.userAnswerSummary}
                    </p>
                  </div>
                  <div className="h-9 w-9 flex items-center justify-center">
                    {openQuestion === q.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="px-6 pb-6 pt-0 space-y-4 border-t pt-4">
                    <div className="flex items-center justify-between bg-muted/30 p-3 rounded-md border">
                      <div className="flex items-center gap-3">
                        <Button size="icon" variant="outline" className="h-8 w-8 rounded-full">
                          <Play className="h-3 w-3" />
                        </Button>
                        <div className="space-y-0.5">
                          <div className="text-xs font-medium">Audio Recording</div>
                          <div className="text-[10px] text-muted-foreground">00:45 • 1.2 MB</div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-xs">
                        Download
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Your Answer Summary</h4>
                        <p className="text-sm bg-muted/50 p-3 rounded-md">{q.userAnswerSummary}</p>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">AI Feedback</h4>
                        <p className="text-sm bg-primary/5 p-3 rounded-md border border-primary/10">{q.aiFeedback}</p>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">Suggested Improvements</h4>
                      <div className="flex flex-wrap gap-2">
                        {q.improvements.map((imp, i) => (
                          <Badge key={i} variant="outline" className="bg-background">
                            <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
                            {imp}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="transcript" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Full Transcript</CardTitle>
              <CardDescription>Review the entire conversation history</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {mockReport.transcript.map((entry, i) => (
                <div key={i} className={cn("flex gap-4", entry.speaker === 'You' ? "flex-row-reverse" : "")}>
                  <div className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                    entry.speaker === 'You' ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    {entry.speaker === 'You' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className={cn(
                    "flex flex-col gap-1 max-w-[80%]",
                    entry.speaker === 'You' ? "items-end" : "items-start"
                  )}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{entry.speaker}</span>
                      <span className="text-xs text-muted-foreground">{entry.timestamp}</span>
                    </div>
                    <div className={cn(
                      "rounded-lg px-4 py-2 text-sm",
                      entry.speaker === 'You' 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted"
                    )}>
                      {entry.text}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="speech" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mic className="h-5 w-5" /> Filler Word Analysis
                </CardTitle>
                <CardDescription>Frequency of hesitation words used</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mockReport.fillerWordsAnalysis} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#333" />
                    <XAxis type="number" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis dataKey="word" type="category" stroke="#888" fontSize={12} tickLine={false} axisLine={false} width={60} />
                    <RechartsTooltip 
                      cursor={{ fill: '#333', opacity: 0.2 }}
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                    />
                    <Bar dataKey="count" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={20} name="Count" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" /> Speaking Pace
                </CardTitle>
                <CardDescription>Words per minute (WPM) over time</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mockReport.pacingAnalysis}>
                    <defs>
                      <linearGradient id="colorWpm" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="time" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} domain={[100, 180]} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="wpm" 
                      stroke="#3b82f6" 
                      strokeWidth={2} 
                      fillOpacity={1} 
                      fill="url(#colorWpm)" 
                      name="WPM" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="swot" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-500">
                  <CheckCircle2 className="h-5 w-5" /> Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {mockReport.swot.strengths.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-500">
                  <AlertCircle className="h-5 w-5" /> Weaknesses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {mockReport.swot.weaknesses.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-500">
                  <TrendingUp className="h-5 w-5" /> Opportunities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {mockReport.swot.opportunities.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-500">
                  <AlertCircle className="h-5 w-5" /> Threats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {mockReport.swot.threats.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="behavioral" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            {Object.entries(mockReport.behavioralAnalysis).map(([key, value]) => (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium capitalize text-muted-foreground">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {mockReport.resources.map((resource, i) => (
              <Card key={i} className="group cursor-pointer hover:border-primary/50 transition-colors">
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary">{resource.type}</Badge>
                    <Share2 className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <CardTitle className="text-lg group-hover:text-primary transition-colors">
                    {resource.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button variant="link" className="p-0 h-auto">
                    View Resource <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
