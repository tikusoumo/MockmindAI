"use client";

import { useState, useEffect } from "react";
import { 
  MessageSquare, Heart, Share2, MoreHorizontal, Search, PenSquare, Trash, CornerDownRight, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { jwtDecode } from "jwt-decode";
import { formatDistanceToNow } from "date-fns";

export default function CommunityPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("feed");
  const [search, setSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>("user");

  // Create post states
  const [isWriteOpen, setIsWriteOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");

  // Comments state { postId: { comments: [], open: boolean, newContent: string } }
  const [commentsState, setCommentsState] = useState<Record<string, any>>({});

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        setCurrentUserId(decoded.userId);
        setCurrentUserRole(decoded.role || 'user');
      } catch(e) {}
    }
    fetchPosts();
  }, [activeTab]);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/community/posts?tab=${activeTab}&search=${search}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setPosts(await res.json());
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!newContent) return;
    try {
      const token = localStorage.getItem('token');
      const tagsArray = newTags.split(',').map(t => t.trim()).filter(t => t);
      const res = await fetch('/api/community/posts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, content: newContent, tags: tagsArray })
      });
      if (res.ok) {
        toast.success("Your post is now live.");
        setIsWriteOpen(false);
        setNewTitle("");
        setNewContent("");
        setNewTags("");
        fetchPosts();
      }
    } catch(e) {}
  };

  const handleDeletePost = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/community/posts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Post has been removed.");
        setPosts(posts.filter(p => p.id !== id));
      }
    } catch (e) {}
  };

  const handleToggleLike = async (postId: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/community/posts/${postId}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if(res.ok) {
        const { liked } = await res.json();
        setPosts(posts.map(p => {
          if (p.id === postId) {
            return {
              ...p,
              isLikedByMe: liked,
              likesCount: p.likesCount + (liked ? 1 : -1)
            };
          }
          return p;
        }));
      }
    } catch (e) {}
  };

  const loadComments = async (postId: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/community/posts/${postId}/comments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCommentsState(prev => ({
          ...prev,
          [postId]: { ...prev[postId], comments: data, open: true }
        }));
      }
    } catch (e) {}
  };

  const toggleComments = (postId: string) => {
    const currentState = commentsState[postId] || { open: false, newContent: '' };
    if (!currentState.open) {
      loadComments(postId);
    } else {
      setCommentsState(prev => ({
        ...prev,
        [postId]: { ...prev[postId], open: false }
      }));
    }
  };

  const handleAddComment = async (postId: string) => {
    const content = commentsState[postId]?.newContent;
    if (!content) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/community/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (res.ok) {
        toast.success("Comment added.");
        setCommentsState(prev => ({
          ...prev,
          [postId]: { ...prev[postId], newContent: '' }
        }));
        loadComments(postId);
        // increment comment count visually
        setPosts(posts.map(p => p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p));
      }
    } catch(e) {}
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/community/comments/${commentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Comment removed.");
        loadComments(postId);
        setPosts(posts.map(p => p.id === postId ? { ...p, commentsCount: p.commentsCount - 1 } : p));
      }
    } catch(e) {}
  };

  const canEdit = (authorId: number) => authorId === currentUserId || currentUserRole === 'superadmin';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Community</h1>
          <p className="text-muted-foreground mt-1">Connect with other candidates and share tips.</p>
        </div>
        <Dialog open={isWriteOpen} onOpenChange={setIsWriteOpen}>
          <DialogTrigger asChild>
            <Button><PenSquare className="mr-2 h-4 w-4" /> Write Post</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Write a Post</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Title (optional)</Label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="A catchy title..." />
              </div>
              <div className="grid gap-2">
                <Label>Content *</Label>
                <Textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={5} placeholder="What's on your mind?" />
              </div>
              <div className="grid gap-2">
                <Label>Tags (comma separated)</Label>
                <Input value={newTags} onChange={(e) => setNewTags(e.target.value)} placeholder="System Design, Meta, Success" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsWriteOpen(false)}>Cancel</Button>
              <Button onClick={handleCreatePost} disabled={!newContent.trim()}>Post</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-[11px] h-4 w-4 text-muted-foreground" />
          <Input type="search" placeholder="Search discussions..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchPosts()} />
        </div>
        <Button variant="outline" onClick={fetchPosts}>Search</Button>
      </div>

      <Tabs defaultValue="feed" onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="feed">Your Feed</TabsTrigger>
          <TabsTrigger value="popular">Popular</TabsTrigger>
          <TabsTrigger value="recent">Recent</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading posts...</div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
              No posts found. Be the first to start a discussion!
            </div>
          ) : (
            posts.map((post) => (
              <Card key={post.id} className="overflow-hidden transition-all hover:shadow-sm">
                <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-3">
                  <Avatar>
                    <AvatarImage src={post.author?.avatar} />
                    <AvatarFallback>{post.author?.name?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium leading-none">{post.author?.name || 'Unknown User'}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(post.timestamp))} ago {post.author?.role !== 'user' ? " • " + post.author?.role : ''}
                        </p>
                      </div>
                      {canEdit(post.authorId) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500" onClick={() => handleDeletePost(post.id)}>
                          <Trash className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-3 text-sm">
                  {post.title && <h3 className="font-semibold text-base mb-2">{post.title}</h3>}
                  <div className="whitespace-pre-line leading-relaxed text-muted-foreground">{post.content}</div>
                  {post.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {post.tags.map((tag: string) => (
                        <Badge key={tag} variant="secondary" className="text-xs font-normal bg-secondary hover:bg-secondary/80">#{tag}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex-col px-0 py-0 items-start">
                  <div className="flex w-full items-center justify-between border-t px-6 py-3 bg-muted/10">
                    <div className="flex gap-4">
                      <Button variant="ghost" size="sm" className={"gap-2 " + (post.isLikedByMe ? 'text-red-500 hover:text-red-600 hover:bg-red-50' : '')} onClick={() => handleToggleLike(post.id)}>
                        <Heart className={"h-4 w-4 " + (post.isLikedByMe ? 'fill-current' : '')} />
                        <span>{post.likesCount || 0}</span>
                      </Button>
                      <Button variant="ghost" size="sm" className={"gap-2 " + (commentsState[post.id]?.open ? 'bg-accent' : '')} onClick={() => toggleComments(post.id)}>
                        <MessageSquare className="h-4 w-4" />
                        <span>{post.commentsCount || 0}</span>
                      </Button>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Comments Section */}
                  {commentsState[post.id]?.open && (
                    <div className="w-full bg-accent/20 p-6 border-t">
                      <div className="space-y-4 max-h-[300px] overflow-y-auto mb-4 pr-2">
                        {commentsState[post.id].comments?.map((comment: any) => (
                          <div key={comment.id} className="flex gap-3">
                            <CornerDownRight className="w-4 h-4 text-muted-foreground mt-1 opacity-50" />
                            <Avatar className="h-6 w-6 mt-1">
                              <AvatarFallback className="text-[10px]">{comment.author?.name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 bg-background/80 rounded-md p-3 border shadow-sm text-sm">
                              <div className="flex justify-between items-start mb-1">
                                <span className="font-semibold text-xs">{comment.author?.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(comment.createdAt))} ago</span>
                                  {canEdit(comment.authorId) && (
                                    <button onClick={() => handleDeleteComment(post.id, comment.id)} className="text-muted-foreground hover:text-red-500"><X className="h-3 w-3"/></button>
                                  )}
                                </div>
                              </div>
                              <p className="text-muted-foreground">{comment.content}</p>
                            </div>
                          </div>
                        ))}
                        {commentsState[post.id].comments?.length === 0 && (
                          <div className="text-xs text-muted-foreground text-center py-2">No comments yet.</div>
                        )}
                      </div>
                      
                      <div className="flex gap-2 isolate pt-2 border-t border-border/50">
                        <Input 
                          placeholder="Write a reply..." 
                          className="bg-background max-w-none"
                          value={commentsState[post.id].newContent || ''}
                          onChange={e => setCommentsState(prev => ({...prev, [post.id]: {...prev[post.id], newContent: e.target.value}}))}
                          onKeyDown={e => e.key === 'Enter' && handleAddComment(post.id)}
                        />
                        <Button onClick={() => handleAddComment(post.id)}>Reply</Button>
                      </div>
                    </div>
                  )}
                </CardFooter>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
