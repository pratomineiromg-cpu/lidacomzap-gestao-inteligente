import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { prepareCampaignQueue, processQueueDrafts, updateCampaignDailyLimit } from '../services/Actions';

export const Disparador = () => {
  const { campaigns, dispatchQueue, contacts } = useAppStore();
  const [editingLimit, setEditingLimit] = useState(false);
  const [tempLimit, setTempLimit] = useState(0);
  
  // Use first campaign for demo
  const campaign = campaigns[0];
  const queueItems = dispatchQueue.filter(q => q.campaignId === campaign.id);
  const queuedCount = queueItems.filter(q => q.status === 'QUEUED').length;
  const draftCount = queueItems.filter(q => q.status === 'DRAFT_PREPARED').length;
  const sentCount = queueItems.filter(q => q.status === 'SENT' || q.status === 'REPLIED').length;
  const repliedCount = queueItems.filter(q => q.status === 'REPLIED').length;

  const handleEditLimit = () => {
    setTempLimit(campaign.dailyLimit);
    setEditingLimit(true);
  };

  const handleSaveLimit = () => {
    let limit = Math.floor(tempLimit);
    if (isNaN(limit) || limit < 1) {
      limit = 1;
    }
    updateCampaignDailyLimit(campaign.id, limit);
    setEditingLimit(false);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Disparador Inteligente</h2>
          <p className="text-sm text-slate-500 mt-1">Transforme sua base de contatos em vendas ativas.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="font-bold text-slate-800">Campanha Ativa: {campaign.name}</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-8 mb-6">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Template da Mensagem</label>
              <div className="p-4 bg-slate-100 rounded-lg text-sm text-slate-700 border border-slate-200 font-mono">
                {campaign.template}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Configurações</label>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 border border-slate-200 rounded-lg">
                  <span className="text-sm font-medium text-slate-700">Limite Diário</span>
                  {editingLimit ? (
                    <div className="flex items-center space-x-2">
                      <input 
                        type="number" 
                        value={tempLimit} 
                        onChange={(e) => setTempLimit(Number(e.target.value))}
                        className="w-20 text-sm border border-slate-300 rounded px-2 py-1 outline-none focus:border-indigo-500"
                        autoFocus
                      />
                      <button onClick={handleSaveLimit} className="text-xs bg-indigo-600 text-white px-2 py-1.5 rounded hover:bg-indigo-700 transition-colors">Salvar</button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 cursor-pointer group" onClick={handleEditLimit}>
                      <span className="font-bold text-slate-900">{campaign.dailyLimit} envios</span>
                      <span className="text-xs text-indigo-600 underline opacity-0 group-hover:opacity-100 transition-opacity">Editar</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center p-3 border border-slate-200 rounded-lg bg-indigo-50 border-indigo-100">
                  <span className="text-sm font-medium text-indigo-800">Contatos Elegíveis</span>
                  <span className="font-bold text-indigo-900">{contacts.length - queueItems.length}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex space-x-4 border-t border-slate-100 pt-6">
            <button 
              onClick={() => prepareCampaignQueue(campaign.id)}
              className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
            >
              Popular Fila de Contatos
            </button>
            <button 
              onClick={() => processQueueDrafts(campaign.id)}
              disabled={queuedCount === 0}
              className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors"
            >
              Preparar Rascunhos ({queuedCount})
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800">Progresso da Fila</h3>
          <div className="flex space-x-4 text-sm font-medium">
            <span className="text-slate-500">Na fila: {queuedCount}</span>
            <span className="text-amber-600">Rascunhos: {draftCount}</span>
            <span className="text-emerald-600">Enviados: {sentCount}</span>
            <span className="text-indigo-600">Responderam: {repliedCount}</span>
          </div>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="p-4 font-semibold">Posição</th>
              <th className="p-4 font-semibold">Contato</th>
              <th className="p-4 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {queueItems.map(item => {
              const contact = contacts.find(c => c.id === item.contactId);
              return (
                <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="p-4 text-slate-500 font-mono">#{item.position}</td>
                  <td className="p-4 font-medium text-slate-900">{contact?.name}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      item.status === 'QUEUED' ? 'bg-slate-100 text-slate-600' :
                      item.status === 'DRAFT_PREPARED' ? 'bg-amber-100 text-amber-700' :
                      item.status === 'SENT' ? 'bg-emerald-100 text-emerald-700' :
                      item.status === 'REPLIED' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {item.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              )
            })}
            {queueItems.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-slate-500">
                  Fila vazia. Clique em "Popular Fila" para iniciar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
