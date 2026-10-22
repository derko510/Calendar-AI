import { createRoot } from 'react-dom/client';
import EventTooltip from './src/components/EventTooltip';
const ev = { id: 'x1', summary: 'Derrick Ko | Interview with Apex Technologies', start: { dateTime: '2026-10-26T14:30:00' }, end: { dateTime: '2026-10-26T15:00:00' }, location: '510-853-3510',
  description: 'This meeting will take place over the phone. We will give you a call at 510-853-3510.<br><br><br>* 2:30 PM - 3:00 PM (PDT) - Recruiter Screen<br><br>* Russell Choi (Technical Recruiter, LinkedIn)<br>More details here that run long and should clamp at four lines total in the card.' };
createRoot(document.getElementById('r')).render(<>
  <div style={{position:'absolute',left:280,top:330,width:190,height:24,background:'#EDE4EE',borderLeft:'2px solid #8D5E95',fontSize:11,padding:'2px 6px'}}>Derrick Ko | Interview…</div>
  <EventTooltip hovered={{ event: ev, rect: { left: 280, top: 330, width: 190, bottom: 354 } }} />
  <EventTooltip hovered={{ event: { ...ev, id:'b', description:'' , location:''}, rect: { left: 700, top: 40, width: 120, bottom: 64 } }} />
</>);
