import { useState, useEffect, useMemo, useRef } from 'react';
import { Credential } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Loader2, Plus, ChevronDown, X, Check } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  selectCredentialsByIds,
  selectCredentialsLoading,
  selectCredentials,
  selectDefaultCredentialsId,
  fetchCredentials
} from '@/app/store/credentialsSlice';
import type { AppDispatch, RootState } from '@/app/store/store';
import { CredentialDialog } from '@/components/global/credential-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TestCaseCredentialsProps {
  productId: string | undefined;
  credentialIds: string[] | undefined;
  testCaseId: string | undefined;
  isEditing: boolean;
  isSaving: boolean;
  onCredentialRemove: (credentialId: string) => void;
  onCredentialChange: (credentialId: string) => void;
  showAddCredentials?: boolean;
  showDefaultCredentials?: boolean;
  isBulkMode?: boolean;
}

interface CredentialCardProps {
  credential: Credential;
  showPassword: boolean;
  onTogglePassword: (id: string) => void;
  onRemove?: (id: string) => void;
  onClick: (credential: Credential) => void;
  isEditing?: boolean;
  isSaving?: boolean;
  isDefault?: boolean;
}

const CredentialCard = ({
  credential,
  showPassword,
  onTogglePassword,
  onRemove,
  onClick,
  isEditing,
  isSaving,
  isDefault
}: CredentialCardProps) => {
  return (
  <div 
    className="p-3 bg-gray-50 rounded-md border border-gray-100 cursor-pointer hover:border-purple-600 transition-colors"
    onClick={() => onClick(credential)}
  >
    <div className="flex justify-between items-start mb-2">
      <div className="flex-1">
        <div className="flex flex-col gap-2">
          {(() => {
            const entries = Object.entries(credential.credentials || {}).filter(([, v]) => v);
            const usernameEntry = entries.find(([k]) => k === 'username');
            const ordered = usernameEntry ? [usernameEntry, ...entries.filter(([k]) => k !== 'username')] : entries;
            return ordered.map(([k, v]) => {
              const isPassword = k.toLowerCase() === 'password';
              const label = k.toLowerCase() === 'pin' ? 'PIN' : k.charAt(0).toUpperCase() + k.slice(1);
              return (
                <div key={k} className="flex flex-col">
                  <p className="text-xs text-gray-500">{label}</p>
                  <div className="font-medium flex items-center">
                    <span>
                      {isPassword ? (showPassword ? v : '••••••••') : v}
                    </span>
                    {isPassword && (
                      <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 ml-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePassword(credential.id);
                        }}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
    <div className="flex justify-between items-center">
      <div>
        <p className="text-xs text-gray-500">Description</p>
        {credential.description && (
          <p className="text-xs font-medium mt-2">
            {credential.description}
            {isDefault && <span className="ml-2 text-purple-600">(Default)</span>}
          </p>
        )}
      </div>
      {isEditing && onRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-500"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(credential.id);
          }}
          disabled={isSaving}
        >
          Remove
        </Button>
      )}
    </div>
  </div>
)};

export function TestCaseCredentials({ 
  productId, 
  credentialIds,
  testCaseId,
  isEditing,
  isSaving,
  onCredentialRemove,
  onCredentialChange,
  showAddCredentials = true,
  showDefaultCredentials = true,
  isBulkMode = false
}: TestCaseCredentialsProps) {
  const dispatch = useDispatch<AppDispatch>();
  const credentials = useSelector((state: RootState) => selectCredentialsByIds(state, credentialIds || []));
  const allCredentialsMap = useSelector((state: RootState) => selectCredentials(state));
  const allCredentials = Object.values(allCredentialsMap);
  const isLoading = useSelector((state: RootState) => selectCredentialsLoading(state));
  const defaultCredentialsId = useSelector((state: RootState) => selectDefaultCredentialsId(state));

  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [selectedCredential, setSelectedCredential] = useState<Credential | null>(null);
  const [isCredentialDialogOpen, setIsCredentialDialogOpen] = useState(false);
  const [credentialDialogMode, setCredentialDialogMode] = useState<"view" | "add" | "edit">("view");
  const [tempSelectedCredentialIds, setTempSelectedCredentialIds] = useState<string[]>(credentialIds || []);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setTempSelectedCredentialIds([]);
      setIsDropdownOpen(false);
      setSearchQuery("");
    } else {
      setTempSelectedCredentialIds(credentialIds || []);
    }
  }, [isEditing, credentialIds]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleCredentialClick = (credential: Credential) => {
    setSelectedCredential(credential);
    setCredentialDialogMode("view");
    setIsCredentialDialogOpen(true);
  };

  const handleCredentialToggle = (credentialId: string) => {
    setTempSelectedCredentialIds(prev => {
      const isSelected = prev.includes(credentialId);
      if (isSelected) {
        return prev.filter(id => id !== credentialId);
      } else {
        return [...prev, credentialId];
      }
    });

    onCredentialChange(credentialId);
  };

  const handleCredentialAdded = async (newCredentialId?: string) => {
    if (!newCredentialId) return;
    
    if (productId) {
      await dispatch(fetchCredentials(productId));
    }

    setTempSelectedCredentialIds(prev => [...prev, newCredentialId]);
    onCredentialChange(newCredentialId);
  };

  const handleRemoveCredential = (credentialId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }

    if (isEditing) {
      setTempSelectedCredentialIds(prev => prev.filter(id => id !== credentialId));
      onCredentialChange(credentialId);
      return;
    }

    onCredentialRemove(credentialId);
  };

  const handleDoneClick = () => {
    setIsDropdownOpen(false);
  };

  const renderCredentialsList = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-4 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading credentials...
        </div>
      );
    }

    const savedCredentials = credentials.filter(credential => credentialIds?.includes(credential.id));
    const defaultCredential = showDefaultCredentials ? Object.values(allCredentialsMap).find(cred => cred.id === defaultCredentialsId) : undefined;

    if (savedCredentials.length === 0 && !defaultCredential && isBulkMode) {
      return null;
    }

    if (savedCredentials.length === 0 && !defaultCredential) {
      return (
        <div className="text-sm text-gray-500 text-center p-4">
          No existing credentials found for this test case
        </div>
      );
    }

    return (
      <div className="space-y-4 flex flex-col">
        {savedCredentials.map((credential) => (
          <CredentialCard
            key={credential.id}
            credential={credential}
            showPassword={showPasswords[credential.id]}
            onTogglePassword={togglePasswordVisibility}
            onRemove={onCredentialRemove}
            onClick={handleCredentialClick}
            isEditing={isEditing}
            isSaving={isSaving}
          />
        ))}

        {savedCredentials.length === 0 && defaultCredential && (
          <CredentialCard
            credential={defaultCredential}
            showPassword={showPasswords[defaultCredential.id]}
            onTogglePassword={togglePasswordVisibility}
            onClick={handleCredentialClick}
            isDefault={true}
          />
        )}
      </div>
    );
  };

  const filteredCredentials = useMemo(() => {
    if (!isEditing || !isDropdownOpen) {
      return [];
    }

    const availableCredentials = allCredentials.filter(cred => 
      !tempSelectedCredentialIds.includes(cred.id)
    );
    
    return availableCredentials.filter(cred => {
      const query = searchQuery.toLowerCase();
      const uname = cred.credentials?.username || "";
      const descriptionMatch = cred.description.toLowerCase().includes(query);
      const usernameMatch = uname.toLowerCase().includes(query);
      const fieldMatch = Object.entries(cred.credentials || {}).some(([k, v]) => 
        v && (k.toLowerCase().includes(query) || String(v).toLowerCase().includes(query))
      );
      return usernameMatch || descriptionMatch || fieldMatch;
    });
  }, [allCredentials, tempSelectedCredentialIds, isEditing, isDropdownOpen, searchQuery]);

  const togglePasswordVisibility = (credentialId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [credentialId]: !prev[credentialId]
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          {showAddCredentials && (
            <Label className="text-sm font-medium text-gray-700">
              Add Account Credentials
            </Label>
          )}
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm text-gray-500">Loading credentials...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {showAddCredentials && (
          <Label className="text-sm font-medium text-gray-700">
            Add Account Credentials
          </Label>
        )}
        
        {/* Multiselect Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <div
            className={`flex flex-wrap gap-1 min-h-[38px] p-2 border rounded-md pr-10 ${
              isEditing && !isSaving 
                ? "cursor-pointer border-gray-200 hover:border-gray-300" 
                : "cursor-not-allowed bg-gray-50 border-gray-200"
            }`}
            onClick={() => isEditing && !isSaving && setIsDropdownOpen(!isDropdownOpen)}
          >
            {!isEditing ? (
              <span className="text-sm py-0.5 text-gray-400">
                Select credentials...
              </span>
            ) : tempSelectedCredentialIds.length === 0 ? (
              <span className="text-sm py-0.5 text-gray-500">
                Select credentials...
              </span>
            ) : (
              tempSelectedCredentialIds.map(credId => {
                const cred = allCredentialsMap[credId];
                if (!cred) return null;
                const uname = cred.credentials?.username;
                const displayText = uname || (() => {
                  const entries = Object.entries(cred.credentials || {});
                  const firstField = entries.find(([, v]) => v);
                  if (firstField) {
                    const [key, value] = firstField;
                    const label = key.toLowerCase() === 'pin' ? 'PIN' : key.charAt(0).toUpperCase() + key.slice(1);
                    return `${label}: ${value}`;
                  }
                  return "Credential";
                })();
                return (
                  <div
                    key={credId}
                    className="bg-purple-100 text-purple-800 text-xs rounded-full py-1 px-3 flex items-center gap-1"
                  >
                    <span>{displayText}</span>
                    <X className="h-3 w-3 cursor-pointer hover:text-purple-950" onClick={(e) => handleRemoveCredential(credId, e)} />
                  </div>
                );
              })
            )}
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <ChevronDown className={`h-5 w-5 ${isEditing ? "text-gray-400" : "text-gray-300"}`} />
            </div>
          </div>

          {/* Dropdown Menu - Only show when editing and dropdown is open */}
          {isEditing && isDropdownOpen && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
              {/* Search Input */}
              <div className="p-2 border-b">
                <Input
                  type="text"
                  placeholder="Search credentials..."
                  className="w-full text-sm border-gray-200"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Add New Credential Option */}
              {showAddCredentials && (
                <div
                  className="flex items-center px-3 py-2 hover:bg-purple-50 cursor-pointer text-purple-600 font-medium"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    setSelectedCredential(null);
                    setCredentialDialogMode("add");
                    setIsCredentialDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add new credential
                </div>
              )}

              {/* Credentials List */}
              <div className="max-h-60 overflow-y-auto">
                {isBulkMode && allCredentials.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    No existing credentials found
                  </div>
                ) : filteredCredentials.length > 0 ? (
                  filteredCredentials.map((cred) => (
                    <div
                      key={cred.id}
                      className="flex items-center px-3 py-2 hover:bg-purple-50 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCredentialToggle(cred.id);
                      }}
                    >
                      <div
                        className={`w-5 h-5 rounded border flex-none flex items-center justify-center mr-2 ${
                          tempSelectedCredentialIds.includes(cred.id)
                            ? "bg-purple-600 border-purple-600"
                            : "border-gray-300"
                        }`}
                      >
                        {tempSelectedCredentialIds.includes(cred.id) && (
                          <Check className="h-3 w-3 text-white" />
                        )}
                      </div>
                      <div className="flex-1 flex flex-col">
                        <span className="text-sm font-medium">
                          {(() => {
                            const uname = cred.credentials?.username;
                            if (uname) return uname;
                            const entries = Object.entries(cred.credentials || {});
                            const firstField = entries.find(([, v]) => v);
                            if (firstField) {
                              const [key, value] = firstField;
                              const label = key.toLowerCase() === 'pin' ? 'PIN' : key.charAt(0).toUpperCase() + key.slice(1);
                              return `${label}: ${value}`;
                            }
                            return "Credential";
                          })()}
                        </span>
                        <span className="text-xs text-gray-500">{cred.description}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    No credentials match your search
                  </div>
                )}
              </div>

              {/* Done Button */}
              <div className="p-2 border-t flex justify-between">
                <span className="text-xs text-gray-500 flex items-center">
                  {tempSelectedCredentialIds.length} credential(s) selected
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 h-8 px-3"
                  onClick={handleDoneClick}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Existing Credentials List */}
      <div className="space-y-3">
        {renderCredentialsList()}
      </div>

      {isCredentialDialogOpen && (
        <CredentialDialog
          open={isCredentialDialogOpen}
          onOpenChange={setIsCredentialDialogOpen}
          credential={selectedCredential}
          mode={credentialDialogMode}
          onModeChange={setCredentialDialogMode}
          onCredentialAdded={handleCredentialAdded}
          testCaseId={testCaseId}
          isTestCaseLevel={testCaseId !== undefined}
        />
      )}
    </div>
  );
}