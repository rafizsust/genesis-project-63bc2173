import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  Factory, 
  Play, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  Eye,
  Upload,
  ArrowLeft,
} from "lucide-react";

interface GenerationJob {
  id: string;
  module: string;
  topic: string;
  difficulty: string;
  quantity: number;
  status: string;
  success_count: number;
  failure_count: number;
  error_log: Array<{ index: number; error: string }>;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface GeneratedTest {
  id: string;
  status: string;
  voice_id: string;
  accent: string;
  is_published: boolean;
  created_at: string;
}

const MODULES = [
  { value: "listening", label: "Listening" },
  { value: "speaking", label: "Speaking" },
  { value: "reading", label: "Reading" },
  { value: "writing", label: "Writing" },
];

const DIFFICULTIES = [
  { value: "easy", label: "Easy (Band 5-6)" },
  { value: "medium", label: "Medium (Band 6-7)" },
  { value: "hard", label: "Hard (Band 7-9)" },
];

const ACCENTS = [
  { value: "random", label: "Random (Variety)" },
  { value: "US", label: "American (US)" },
  { value: "GB", label: "British (UK)" },
  { value: "AU", label: "Australian" },
  { value: "IN", label: "Indian" },
  { value: "mixed", label: "Mixed (All accents)" },
];

const TOPICS = {
  listening: ["Travel", "Education", "Environment", "Technology", "Health", "Culture", "Business", "Science"],
  speaking: ["Family", "Work", "Hobbies", "Travel", "Education", "Technology", "Environment", "Food"],
  reading: ["Science", "History", "Technology", "Environment", "Society", "Culture", "Business", "Health"],
  writing: ["Education", "Environment", "Technology", "Society", "Health", "Work", "Government", "Culture"],
};

export default function TestFactoryAdmin() {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdminAccess();

  const [module, setModule] = useState<string>("listening");
  const [topic, setTopic] = useState<string>("");
  const [customTopic, setCustomTopic] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [accent, setAccent] = useState<string>("random");
  const [quantity, setQuantity] = useState<number>(5);
  const [isGenerating, setIsGenerating] = useState(false);

  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<GenerationJob | null>(null);
  const [jobTests, setJobTests] = useState<GeneratedTest[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  // Fetch jobs on mount and set up realtime subscription
  useEffect(() => {
    if (!isAdmin) return;

    fetchJobs();

    // Subscribe to realtime updates for jobs
    const channel = supabase
      .channel("bulk-generation-jobs")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bulk_generation_jobs",
        },
        (payload) => {
          console.log("Job update:", payload);
          fetchJobs();
          if (selectedJob && payload.new && (payload.new as GenerationJob).id === selectedJob.id) {
            setSelectedJob(payload.new as GenerationJob);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, selectedJob?.id]);

  // Fetch job details when selected
  useEffect(() => {
    if (selectedJob) {
      fetchJobDetails(selectedJob.id);
    }
  }, [selectedJob?.id]);

  const fetchJobs = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-job-status`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      if (data.jobs) {
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    } finally {
      setLoadingJobs(false);
    }
  };

  const fetchJobDetails = async (jobId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-job-status?jobId=${jobId}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      if (data.tests) {
        setJobTests(data.tests);
      }
    } catch (error) {
      console.error("Failed to fetch job details:", error);
    }
  };

  const startGeneration = async () => {
    const finalTopic = customTopic || topic;
    if (!finalTopic) {
      toast.error("Please select or enter a topic");
      return;
    }

    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Not authenticated");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bulk-generate-tests`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            module,
            topic: finalTopic,
            difficulty,
            quantity,
            accent: (module === "listening" || module === "speaking") ? accent : undefined,
          }),
        }
      );

      const data = await response.json();
      if (data.success) {
        toast.success(data.message);
        fetchJobs();
      } else {
        toast.error(data.error || "Failed to start generation");
      }
    } catch (error) {
      console.error("Generation error:", error);
      toast.error("Failed to start generation");
    } finally {
      setIsGenerating(false);
    }
  };

  const publishTests = async (testIds: string[], publish: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-generated-tests`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ testIds, publish }),
        }
      );

      const data = await response.json();
      if (data.success) {
        toast.success(data.message);
        if (selectedJob) {
          fetchJobDetails(selectedJob.id);
        }
      } else {
        toast.error(data.error || "Failed to update tests");
      }
    } catch (error) {
      toast.error("Failed to update tests");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "processing":
        return <Badge variant="default" className="bg-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing</Badge>;
      case "completed":
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Admin access required</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Factory className="h-8 w-8" />
                Test Factory
              </h1>
              <p className="text-muted-foreground">Bulk generate IELTS tests with audio</p>
            </div>
          </div>
          <Button variant="outline" onClick={fetchJobs}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Generation Form */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>New Generation Job</CardTitle>
              <CardDescription>Configure and start bulk test generation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Module Selection */}
              <div className="space-y-2">
                <Label>Module</Label>
                <Select value={module} onValueChange={setModule}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODULES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Topic Selection */}
              <div className="space-y-2">
                <Label>Topic</Label>
                <Select value={topic} onValueChange={(v) => { setTopic(v); setCustomTopic(""); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a topic" />
                  </SelectTrigger>
                  <SelectContent>
                    {TOPICS[module as keyof typeof TOPICS]?.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Input
                    placeholder="Or enter custom topic..."
                    value={customTopic}
                    onChange={(e) => { setCustomTopic(e.target.value); setTopic(""); }}
                  />
                </div>
              </div>

              {/* Difficulty Selection */}
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Accent Selection (only for listening/speaking) */}
              {(module === "listening" || module === "speaking") && (
                <div className="space-y-2">
                  <Label>Accent Variety</Label>
                  <Select value={accent} onValueChange={setAccent}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCENTS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {accent === "random" && "Each test gets a random accent"}
                    {accent === "mixed" && "Distribute all accents evenly across tests"}
                    {accent !== "random" && accent !== "mixed" && `All tests will use ${accent} accent`}
                  </p>
                </div>
              )}

              {/* Quantity Slider */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Quantity</Label>
                  <span className="text-2xl font-bold">{quantity}</span>
                </div>
                <Slider
                  value={[quantity]}
                  onValueChange={(v) => setQuantity(v[0])}
                  min={1}
                  max={20}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Generate 1-20 tests at once
                </p>
              </div>

              {/* Start Button */}
              <Button
                className="w-full"
                size="lg"
                onClick={startGeneration}
                disabled={isGenerating || (!topic && !customTopic)}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 mr-2" />
                    Start Generation
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Jobs List */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Generation Jobs</CardTitle>
              <CardDescription>Monitor your bulk generation jobs</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {loadingJobs ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No generation jobs yet. Start your first one!
                  </div>
                ) : (
                  <div className="space-y-4">
                    {jobs.map((job) => (
                      <Card
                        key={job.id}
                        className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                          selectedJob?.id === job.id ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => setSelectedJob(job)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="capitalize">
                                {job.module}
                              </Badge>
                              <span className="font-medium">{job.topic}</span>
                            </div>
                            {getStatusBadge(job.status)}
                          </div>
                          
                          <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                            <span>Difficulty: {job.difficulty}</span>
                            <span>{job.success_count + job.failure_count} / {job.quantity}</span>
                          </div>

                          {job.status === "processing" && (
                            <Progress
                              value={((job.success_count + job.failure_count) / job.quantity) * 100}
                              className="h-2"
                            />
                          )}

                          {job.status === "completed" && (
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-green-500 flex items-center gap-1">
                                <CheckCircle className="h-4 w-4" />
                                {job.success_count} success
                              </span>
                              {job.failure_count > 0 && (
                                <span className="text-red-500 flex items-center gap-1">
                                  <XCircle className="h-4 w-4" />
                                  {job.failure_count} failed
                                </span>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Selected Job Details */}
        {selectedJob && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Job Details: {selectedJob.topic}</CardTitle>
                  <CardDescription>
                    Generated tests for {selectedJob.module} module
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => publishTests(jobTests.filter(t => !t.is_published).map(t => t.id), true)}
                    disabled={jobTests.filter(t => !t.is_published).length === 0}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Publish All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {jobTests.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No tests generated yet
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {jobTests.map((test, index) => (
                    <Card key={test.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Test #{index + 1}</span>
                          <Badge variant={test.is_published ? "default" : "secondary"}>
                            {test.is_published ? "Published" : "Draft"}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mb-3">
                          <p>Voice: {test.voice_id}</p>
                          <p>Accent: {test.accent}</p>
                          <p>Status: {test.status}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => publishTests([test.id], !test.is_published)}
                          >
                            {test.is_published ? "Unpublish" : "Publish"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Error Log */}
              {selectedJob.error_log && selectedJob.error_log.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium mb-2 text-destructive">Error Log</h4>
                  <div className="bg-destructive/10 rounded-lg p-4 space-y-2">
                    {selectedJob.error_log.map((err, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-medium">Test #{err.index + 1}:</span>{" "}
                        {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
