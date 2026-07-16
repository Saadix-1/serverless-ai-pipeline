import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  Loader2, 
  AlertCircle, 
  Tag, 
  ListTodo, 
  FileCheck,
  RefreshCw,
  Server
} from 'lucide-react';

// Configuration: check VITE_API_ENDPOINT, fallback to local SAM Rest API
const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000';

interface DocumentResult {
  document_id: string;
  filename: string;
  title: string;
  summary: string;
  action_items: string[];
  keywords: string[];
  processed_at: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error?: string;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [documentId, setDocumentId] = useState<string>('');
  const [result, setResult] = useState<DocumentResult | null>(null);
  const [progressStep, setProgressStep] = useState<string>('');
  
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === "application/pdf") {
        setFile(droppedFile);
      } else {
        showError("Only PDF files are supported.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type === "application/pdf") {
        setFile(selectedFile);
      } else {
        showError("Only PDF files are supported.");
      }
    }
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setStatus('error');
    setFile(null);
  };

  const startPipeline = async () => {
    if (!file) return;

    try {
      setStatus('uploading');
      setProgressStep('Requesting S3 Presigned Upload URL...');

      // 1. Get Presigned S3 Upload URL from Backend
      const response = await fetch(`${API_ENDPOINT}/presigned-url?filename=${encodeURIComponent(file.name)}`);
      if (!response.ok) throw new Error('Failed to get upload authorization.');
      
      const { upload_url, key } = await response.json();
      // Extract document ID (the uuid portion)
      const docId = key.replace('uploads/', '').replace('.pdf', '');
      setDocumentId(docId);

      // 2. Upload file directly to S3 bucket
      setProgressStep('Uploading PDF directly to S3 storage...');
      const uploadRes = await fetch(upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/pdf'
        },
        body: file
      });

      if (!uploadRes.ok) throw new Error('S3 direct upload failed.');

      // 3. Polling DynamoDB status
      setStatus('processing');
      setProgressStep('Extracting text content from document...');
      startPolling(docId);

    } catch (err: any) {
      showError(err.message || 'An unexpected error occurred.');
    }
  };

  const startPolling = (docId: string) => {
    let checkCount = 0;
    
    // Check status every 2 seconds
    pollingIntervalRef.current = setInterval(async () => {
      checkCount++;
      
      try {
        const response = await fetch(`${API_ENDPOINT}/documents/${docId}`);
        if (!response.ok) throw new Error('Failed to retrieve processing status.');
        
        const data: DocumentResult = await response.json();
        
        // Dynamically update UI progress steps based on timing/status
        if (data.status === 'PROCESSING') {
          if (checkCount > 8) {
            setProgressStep('Running AI Summarizer & Key-Value extraction...');
          } else if (checkCount > 3) {
            setProgressStep('Parsing layout and cleaner text formats...');
          }
        } else if (data.status === 'COMPLETED') {
          clearInterval(pollingIntervalRef.current!);
          clearTimeout(timeoutRef.current!);
          setResult(data);
          setStatus('success');
        } else if (data.status === 'FAILED') {
          clearInterval(pollingIntervalRef.current!);
          clearTimeout(timeoutRef.current!);
          throw new Error(data.error || 'AI Pipeline processing failed.');
        }
      } catch (err: any) {
        clearInterval(pollingIntervalRef.current!);
        clearTimeout(timeoutRef.current!);
        showError(err.message || 'Error checking processing status.');
      }
    }, 2000);

    // Timeout polling after 60 seconds (prevent infinite loops)
    timeoutRef.current = setTimeout(() => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        showError('Processing timed out. S3 triggers might be taking too long.');
      }
    }, 60000);
  };

  const resetDashboard = () => {
    setFile(null);
    setStatus('idle');
    setResult(null);
    setDocumentId('');
    setProgressStep('');
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Background Decorative Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md relative z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600/10 p-2 rounded-xl border border-indigo-500/30">
              <FileCheck className="h-6 w-6 text-indigo-400" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-200 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              DocuSense.AI
            </span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-full border border-slate-800">
            <Server className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
            <span>AWS Serverless Infrastructure</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 relative z-10 flex flex-col justify-center">
        
        {/* Title Block */}
        {status !== 'success' && (
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 via-slate-100 to-indigo-300 bg-clip-text text-transparent">
              Serverless AI Document Pipeline
            </h1>
            <p className="mt-3 text-slate-400 max-w-xl mx-auto text-lg leading-relaxed">
              Upload any PDF. AWS S3 will trigger isolated Lambda microservices to clean, parse, and extract intelligence using OpenAI.
            </p>
          </div>
        )}

        {/* Status Blocks */}
        {status === 'idle' && (
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-8 md:p-12 shadow-2xl backdrop-blur-sm">
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all cursor-pointer ${
                dragActive 
                  ? 'border-indigo-500 bg-indigo-500/10' 
                  : 'border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900/60'
              }`}
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <input 
                id="file-upload" 
                type="file" 
                className="hidden" 
                accept=".pdf" 
                onChange={handleFileChange}
              />
              
              <div className="bg-indigo-950/40 p-4 rounded-full border border-indigo-900/50 mb-4 text-indigo-400">
                <Upload className="h-8 w-8" />
              </div>
              
              <h3 className="text-lg font-semibold text-slate-200">
                {file ? file.name : "Drag & drop your PDF here"}
              </h3>
              
              <p className="text-slate-500 text-sm mt-1">
                {file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : "or click to browse from files"}
              </p>
            </div>

            {file && (
              <button 
                onClick={startPipeline}
                className="w-full mt-6 py-4 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium tracking-wide flex items-center justify-center space-x-2 transition-all shadow-lg shadow-indigo-600/25 hover:shadow-indigo-500/35 border border-indigo-400/25 active:scale-[0.98]"
              >
                <span>Process Document</span>
                <CheckCircle className="h-5 w-5" />
              </button>
            )}
          </div>
        )}

        {(status === 'uploading' || status === 'processing') && (
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-12 flex flex-col items-center justify-center text-center shadow-2xl backdrop-blur-sm">
            <div className="relative mb-6">
              <Loader2 className="h-16 w-16 text-indigo-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-indigo-300">
                AI
              </div>
            </div>
            
            <h3 className="text-xl font-semibold text-slate-200 capitalize">
              {status === 'uploading' ? 'Ingesting File' : 'Analyzing Document'}
            </h3>
            
            <p className="text-indigo-400/90 text-sm mt-2 font-mono bg-indigo-950/30 px-4 py-1.5 rounded-full border border-indigo-900/30 max-w-md">
              {progressStep}
            </p>
            
            <div className="w-64 bg-slate-800 h-1.5 rounded-full overflow-hidden mt-6 border border-slate-700/50">
              <div className="bg-indigo-500 h-full animate-[loading_1.5s_infinite_ease-in-out] w-1/3 rounded-full" />
            </div>
            
            <p className="text-slate-500 text-xs mt-8 italic">
              AWS Step Functions & EventBridge are routing events in the cloud...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-slate-900/40 border border-red-900/30 rounded-3xl p-10 text-center shadow-2xl backdrop-blur-sm max-w-lg mx-auto">
            <div className="bg-red-950/40 p-4 rounded-full border border-red-900/50 mb-4 text-red-400 w-16 h-16 mx-auto flex items-center justify-center">
              <AlertCircle className="h-8 w-8" />
            </div>
            
            <h3 className="text-lg font-semibold text-slate-200">Pipeline Error</h3>
            
            <p className="text-slate-400 mt-2 text-sm leading-relaxed bg-red-950/10 p-3 rounded-lg border border-red-950/20 font-mono">
              {errorMessage}
            </p>
            
            <button 
              onClick={resetDashboard}
              className="mt-6 py-2.5 px-6 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl font-medium tracking-wide flex items-center justify-center space-x-2 transition-all mx-auto"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Try Again</span>
            </button>
          </div>
        )}

        {status === 'success' && result && (
          <div className="space-y-6">
            
            {/* Success Hero Card */}
            <div className="bg-gradient-to-br from-indigo-950/40 to-purple-950/20 border border-indigo-900/40 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden backdrop-blur-sm">
              <div className="absolute top-0 right-0 bg-indigo-500/10 text-indigo-400 border-l border-b border-indigo-900/40 px-4 py-1.5 rounded-bl-xl text-xs font-mono">
                {result.document_id.substring(0, 8)}...
              </div>

              <div className="flex items-center space-x-3 mb-4">
                <FileText className="h-7 w-7 text-indigo-400" />
                <h2 className="text-xl md:text-2xl font-bold text-slate-100 truncate pr-20">
                  {result.title || result.filename}
                </h2>
              </div>
              
              <div className="border-t border-indigo-900/30 pt-4 mt-2">
                <h4 className="text-xs uppercase tracking-widest text-indigo-400 font-bold mb-1">Generated Summary</h4>
                <p className="text-slate-300 leading-relaxed text-base font-normal">
                  {result.summary}
                </p>
              </div>
            </div>

            {/* Grid for Action items & Keywords */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Action Items */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 md:p-8 backdrop-blur-sm">
                <div className="flex items-center space-x-2 mb-4 text-indigo-400">
                  <ListTodo className="h-5 w-5" />
                  <h3 className="font-semibold text-slate-200">Key Takeaways</h3>
                </div>
                
                {result.action_items && result.action_items.length > 0 ? (
                  <ul className="space-y-3.5">
                    {result.action_items.map((item, idx) => (
                      <li key={idx} className="flex items-start space-x-3 text-sm text-slate-300 leading-relaxed">
                        <span className="w-5 h-5 flex items-center justify-center bg-indigo-950 text-indigo-400 text-xs rounded-full border border-indigo-900/50 mt-0.5 flex-shrink-0">
                          {idx + 1}
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500 text-sm italic">No specific action items found in this document.</p>
                )}
              </div>

              {/* Keywords / Tags */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 md:p-8 backdrop-blur-sm flex flex-col">
                <div className="flex items-center space-x-2 mb-4 text-indigo-400">
                  <Tag className="h-5 w-5" />
                  <h3 className="font-semibold text-slate-200">Keywords & Tags</h3>
                </div>
                
                {result.keywords && result.keywords.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {result.keywords.map((kw, idx) => (
                      <span key={idx} className="text-xs bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-full transition-all font-mono">
                        #{kw.toLowerCase().replace(/\s+/g, '')}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm italic">No indexing keywords generated.</p>
                )}

                <div className="mt-auto pt-8 flex">
                  <button 
                    onClick={resetDashboard}
                    className="w-full py-3 px-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium tracking-wide flex items-center justify-center space-x-2 transition-all shadow-md shadow-indigo-600/10 active:scale-[0.98]"
                  >
                    <Upload className="h-4 w-4" />
                    <span>Upload Another PDF</span>
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 relative z-10 text-center">
        <p className="text-xs text-slate-500 font-mono">
          Built with AWS Lambda • DynamoDB • S3 Triggers • OpenAI GPT-4o-mini
        </p>
      </footer>
    </div>
  );
}
