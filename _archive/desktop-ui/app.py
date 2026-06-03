import tkinter as tk
import customtkinter as ctk
import threading
import time
from datetime import datetime
from typing import Optional
from services.adb.manager import ADBManager, Device
from services.adb.mirror import ScreenMirror
from services.api_server import APIServer
from services.worker import Worker
import config as cfg

# ── Modern Light Purple Palette ───────────────────────────────
APP_BG   = "#eee9fc"   # light lavender page background
CARD     = "#ffffff"   # white card
SURF     = "#f4f0fd"   # soft surface
HOVER    = "#e9e3fa"   # hover

SB_BG    = "#1a0d3d"   # dark sidebar bg
SB_HVR   = "#2a1860"   # sidebar hover
SB_ACT   = "#3a2370"   # sidebar active

PRIMARY  = "#7c5cfc"   # purple accent
PRI2     = "#a48aff"   # lighter purple
PRI3     = "#ede8ff"   # very light purple tint

EMERALD  = "#10b981"
SKY      = "#0ea5e9"
AMBER    = "#f59e0b"
ROSE     = "#ef4444"
PINK     = "#ec4899"
BORDER   = "#ddd5f8"

T0       = "#1e1b4b"   # headings
T1       = "#374151"   # body
T2       = "#6b7280"   # secondary
T3       = "#9ca3af"   # muted
T4       = "#d1d5db"   # placeholder
WHITE    = "#ffffff"

# ── Helpers ───────────────────────────────────────────────────

def _hex(c): h=c.lstrip("#"); return int(h[:2],16),int(h[2:4],16),int(h[4:],16)

def _blend(c1,c2,t):
    r1,g1,b1=_hex(c1); r2,g2,b2=_hex(c2)
    return f"#{int(r1+(r2-r1)*t):02x}{int(g1+(g2-g1)*t):02x}{int(b1+(b2-b1)*t):02x}"

def icon_circle(parent, icon:str, bg:str, size:int=38) -> ctk.CTkLabel:
    return ctk.CTkLabel(parent, text=icon, font=("Arial",int(size*.45)),
                        fg_color=bg, text_color=WHITE,
                        width=size, height=size, corner_radius=size//2)

def gradient_top(parent, color:str, h:int=4):
    c = tk.Canvas(parent, height=h, highlightthickness=0, bd=0)
    c.pack(fill="x")
    def _draw(evt=None):
        w=max(c.winfo_width(),1); c.delete("all")
        for i in range(w):
            c.create_line(i,0,i,h, fill=_blend(color, CARD, (i/w)*.6))
    c.bind("<Configure>",_draw); c.after(60,_draw)


class App:
    GCOLS = 5   # mirror grid columns
    GROWS = 4   # mirror grid rows  (5×4 = 20 slots, no scroll)
    FS_W, FS_H = 262, 584

    def __init__(self, root:ctk.CTk, settings:dict, adb:ADBManager, api:APIServer):
        self.root=root; self.settings=settings; self.adb=adb; self.api=api
        self.devices:list[Device]=[]

        self.adb.log=self._log; self.api.log=self._log
        self.api.on_products=self._on_products_received

        self._worker=Worker(settings,adb)
        self._worker.log=self._log
        self._worker.on_status_change=self._on_worker_status
        self._worker.on_stats_update=self._on_worker_stats
        self._worker.on_finished=self._on_worker_finished

        self._mirrors:dict[str,ScreenMirror]={}
        self._mirror_cells:dict[str,dict]={}
        self._mirror_slots:list[dict]=[]
        self._mirror_slot_map:dict[str,int]={}
        self._mirror_fs_serial=""
        self._drag_start:Optional[tuple]=None
        self._mirror_img=None

        self._build_ui()
        self._start_refresh()

    # ══════════════════════════════════════════════════════
    #  STRUCTURE
    # ══════════════════════════════════════════════════════

    def _build_ui(self):
        self.root.configure(fg_color=APP_BG)
        self.root.grid_columnconfigure(1,weight=1)
        self.root.grid_rowconfigure(0,weight=1)
        self._build_sidebar()
        self._build_main()

    def _build_sidebar(self):
        sb=ctk.CTkFrame(self.root,width=200,fg_color=SB_BG,corner_radius=0)
        sb.grid(row=0,column=0,sticky="nsew"); sb.grid_propagate(False)
        sb.grid_columnconfigure(0,weight=1); sb.grid_rowconfigure(8,weight=1)

        # Brand
        brand=ctk.CTkFrame(sb,fg_color="transparent")
        brand.grid(row=0,column=0,padx=18,pady=(22,16),sticky="ew")
        row=ctk.CTkFrame(brand,fg_color="transparent"); row.pack(fill="x")
        ctk.CTkLabel(row,text="S",font=("Arial Black",18,"bold"),
                     fg_color=PRIMARY,text_color=WHITE,
                     width=42,height=42,corner_radius=12).pack(side="left")
        col=ctk.CTkFrame(row,fg_color="transparent"); col.pack(side="left",padx=(10,0))
        ctk.CTkLabel(col,text="Shopee VDO",font=("Arial",13,"bold"),text_color=WHITE).pack(anchor="w")
        ctk.CTkLabel(col,text="Auto Pilot",font=("Arial",9),text_color=PRI2).pack(anchor="w")

        # Divider
        ctk.CTkFrame(sb,height=1,fg_color="#2e1e5a").grid(row=1,column=0,sticky="ew")

        # Nav
        self._nav_btns={}; self._nav_bars={}
        nav=[("dashboard","⬡","Dashboard"),
             ("devices",  "⬡","Devices"),
             ("mirror",   "⬡","Screen Mirror"),
             ("queue",    "⬡","Queue"),
             ("autopilot","⬡","Auto Pilot"),
             ("settings", "⬡","Settings")]
        nf=ctk.CTkFrame(sb,fg_color="transparent")
        nf.grid(row=2,column=0,sticky="nsew",pady=(8,0))
        nf.grid_columnconfigure(0,weight=1)
        for i,(key,_,label) in enumerate(nav):
            wrap=ctk.CTkFrame(nf,fg_color="transparent",height=44)
            wrap.grid(row=i,column=0,sticky="ew",pady=1)
            wrap.grid_propagate(False); wrap.grid_columnconfigure(1,weight=1)
            bar=ctk.CTkFrame(wrap,width=3,height=44,fg_color="transparent",corner_radius=0)
            bar.grid(row=0,column=0,sticky="ns"); self._nav_bars[key]=bar
            btn=ctk.CTkButton(wrap,text=f"   {label}",anchor="w",
                              font=("Arial",12),height=44,
                              fg_color="transparent",text_color=PRI2,
                              hover_color=SB_HVR,corner_radius=0,
                              command=lambda k=key:self._nav(k))
            btn.grid(row=0,column=1,sticky="ew"); self._nav_btns[key]=btn

        ctk.CTkFrame(sb,height=1,fg_color="#2e1e5a").grid(row=9,column=0,sticky="ew")
        sw=ctk.CTkFrame(sb,fg_color="transparent")
        sw.grid(row=10,column=0,padx=18,pady=12,sticky="ew")
        self._sdot=ctk.CTkLabel(sw,text="●",font=("Arial",9),text_color=EMERALD)
        self._sdot.pack(side="left")
        ctk.CTkLabel(sw,text="  System Ready",font=("Arial",10),text_color=PRI2).pack(side="left")
        self._pulse_state=True; self.root.after(1000,self._pulse)

    def _pulse(self):
        try:
            self._sdot.configure(text_color=EMERALD if self._pulse_state else "#1a4a2e")
            self._pulse_state=not self._pulse_state; self.root.after(1200,self._pulse)
        except: pass

    def _build_main(self):
        self._main=ctk.CTkFrame(self.root,fg_color=APP_BG,corner_radius=0)
        self._main.grid(row=0,column=1,sticky="nsew")
        self._main.grid_columnconfigure(0,weight=1); self._main.grid_rowconfigure(1,weight=1)

        # Topbar
        tb=ctk.CTkFrame(self._main,fg_color=WHITE,height=54,corner_radius=0,
                         border_width=0)
        tb.grid(row=0,column=0,sticky="ew"); tb.grid_propagate(False)
        tb.grid_columnconfigure(0,weight=1)
        self._page_title=ctk.CTkLabel(tb,text="Dashboard",
                                       font=("Arial",15,"bold"),text_color=T0)
        self._page_title.grid(row=0,column=0,padx=22,sticky="w")
        chips=ctk.CTkFrame(tb,fg_color="transparent")
        chips.grid(row=0,column=1,padx=16,sticky="e")
        self._tb_dev=self._chip(chips,"📱","0",0,SKY)
        self._tb_q  =self._chip(chips,"📋","0",1,AMBER)
        ctk.CTkFrame(self._main,height=1,fg_color=BORDER).grid(row=0,column=0,sticky="sew")

        self._pf=ctk.CTkFrame(self._main,fg_color=APP_BG,corner_radius=0)
        self._pf.grid(row=1,column=0,sticky="nsew")
        self._pf.grid_columnconfigure(0,weight=1); self._pf.grid_rowconfigure(0,weight=1)

        self._pages={}
        self._build_dashboard(); self._build_devices()
        self._build_mirror(); self._build_queue()
        self._build_autopilot(); self._build_settings()
        self._nav("dashboard")

    def _chip(self,p,icon,val,col,color):
        f=ctk.CTkFrame(p,fg_color=SURF,corner_radius=20,
                        border_width=1,border_color=BORDER)
        f.grid(row=0,column=col,padx=4,pady=12,ipadx=10,ipady=3)
        ctk.CTkLabel(f,text=icon,font=("Arial",11),text_color=T3).pack(side="left")
        v=ctk.CTkLabel(f,text=f"  {val}",font=("Arial",12,"bold"),text_color=color)
        v.pack(side="left"); return v

    def _nav(self,key:str):
        titles={"dashboard":"Dashboard","devices":"Devices / ADB",
                "mirror":"Screen Mirror","queue":"Queue",
                "autopilot":"Auto Pilot","settings":"Settings"}
        if key!="mirror":
            for m in list(self._mirrors.values()): m.stop()
            self._mirror_fs_serial=""
        self._page_title.configure(text=titles.get(key,key))
        for k,btn in self._nav_btns.items():
            a=k==key
            btn.configure(fg_color=SB_ACT if a else "transparent",
                          text_color=WHITE if a else PRI2)
            self._nav_bars[k].configure(fg_color=PRIMARY if a else "transparent")
        for k,pg in self._pages.items():
            pg.grid(row=0,column=0,sticky="nsew") if k==key else pg.grid_remove()

    # ══════════════════════════════════════════════════════
    #  DASHBOARD
    # ══════════════════════════════════════════════════════

    def _build_dashboard(self):
        pg=ctk.CTkFrame(self._pf,fg_color=APP_BG,corner_radius=0)
        pg.grid_columnconfigure((0,1,2,3),weight=1); pg.grid_rowconfigure(1,weight=1)

        cards=[("📱","Devices",  "0",SKY,    "stat_devices"),
               ("📋","Queue",    "0",AMBER,  "stat_queue"),
               ("✅","Posted",   "0",EMERALD,"stat_done"),
               ("❌","Errors",   "0",ROSE,   "stat_err")]
        self._stats={}
        for col,(icon,label,val,color,key) in enumerate(cards):
            px=(16 if col==0 else 6, 6 if col<3 else 16)
            card=ctk.CTkFrame(pg,fg_color=CARD,corner_radius=16,
                              border_width=1,border_color=BORDER)
            card.grid(row=0,column=col,padx=px,pady=(18,8),sticky="ew")
            gradient_top(card,color,4)
            inner=ctk.CTkFrame(card,fg_color="transparent")
            inner.pack(fill="x",padx=18,pady=(12,16))
            inner.grid_columnconfigure(0,weight=1)
            top=ctk.CTkFrame(inner,fg_color="transparent")
            top.grid(row=0,column=0,columnspan=2,sticky="ew",pady=(0,6))
            icon_circle(top,icon,color,36).pack(side="left")
            ctk.CTkLabel(top,text=label,font=("Arial",11),
                         text_color=T2).pack(side="left",padx=(10,0))
            lbl=ctk.CTkLabel(inner,text=val,
                              font=("Arial Black",38,"bold"),text_color=T0)
            lbl.grid(row=1,column=0,columnspan=2,sticky="w")
            self._stats[key]=lbl

        # Log
        lw=ctk.CTkFrame(pg,fg_color=CARD,corner_radius=16,
                         border_width=1,border_color=BORDER)
        lw.grid(row=1,column=0,columnspan=4,padx=16,pady=(0,16),sticky="nsew")
        hdr=ctk.CTkFrame(lw,fg_color="transparent")
        hdr.pack(fill="x",padx=16,pady=(14,0))
        ctk.CTkLabel(hdr,text="SYSTEM LOG",font=("Arial",9,"bold"),text_color=T3).pack(side="left")
        ctk.CTkButton(hdr,text="Clear",width=46,height=20,
                      fg_color=SURF,text_color=T2,font=("Arial",9),
                      hover_color=HOVER,corner_radius=6,
                      command=lambda:(self._log_box.configure(state="normal"),
                                      self._log_box.delete("1.0","end"),
                                      self._log_box.configure(state="disabled"))
                      ).pack(side="right")
        self._log_box=ctk.CTkTextbox(lw,font=("Menlo",11),
                                      fg_color="#0d1117",text_color="#39d353",
                                      corner_radius=10,border_width=1,border_color=BORDER)
        self._log_box.pack(fill="both",expand=True,padx=12,pady=(8,12))
        self._pages["dashboard"]=pg

    # ══════════════════════════════════════════════════════
    #  DEVICES
    # ══════════════════════════════════════════════════════

    def _build_devices(self):
        pg=ctk.CTkFrame(self._pf,fg_color=APP_BG,corner_radius=0)
        pg.grid_columnconfigure(0,weight=1); pg.grid_rowconfigure(1,weight=1)
        tb=ctk.CTkFrame(pg,fg_color="transparent")
        tb.grid(row=0,column=0,padx=16,pady=16,sticky="ew")
        self._pb("🔄  Scan",PRIMARY,PRI2,tb,self._scan_devices,120,bold=True).pack(side="left")
        ctk.CTkLabel(tb,text="WiFi ADB:",font=("Arial",11),text_color=T2).pack(side="left",padx=(20,6))
        self._wifi_ip=ctk.CTkEntry(tb,width=150,placeholder_text="192.168.x.x",
                                    fg_color=WHITE,border_color=BORDER,
                                    text_color=T1,placeholder_text_color=T4)
        self._wifi_ip.pack(side="left",padx=(0,6))
        self._pb("Connect",SKY,"#0284c7",tb,self._wifi_connect,86).pack(side="left")
        self._devlist=ctk.CTkScrollableFrame(pg,fg_color=CARD,corner_radius=16,
                                               border_width=1,border_color=BORDER,
                                               label_text="")
        self._devlist.grid(row=1,column=0,padx=16,pady=(0,16),sticky="nsew")
        self._devlist.grid_columnconfigure(0,weight=1)
        ctk.CTkLabel(self._devlist,text="Connect a device via USB and tap Scan",
                     font=("Arial",12),text_color=T3).pack(pady=50)
        self._pages["devices"]=pg

    def _device_card(self,dev:Device):
        color=EMERALD if dev.status=="device" else (AMBER if dev.status=="unauthorized" else T3)
        stxt={"device":"● Connected","unauthorized":"● Auth Needed","offline":"● Offline"
              }.get(dev.status,dev.status)
        card=ctk.CTkFrame(self._devlist,fg_color=SURF,corner_radius=12,
                           border_width=1,border_color=BORDER)
        card.pack(fill="x",padx=10,pady=4); card.grid_columnconfigure(1,weight=1)
        ctk.CTkFrame(card,width=3,fg_color=color,corner_radius=0
                     ).grid(row=0,column=0,rowspan=2,sticky="ns",padx=(0,14),pady=10)
        ctk.CTkLabel(card,text=dev.model or dev.serial,
                     font=("Arial",13,"bold"),text_color=T0
                     ).grid(row=0,column=1,sticky="w",pady=(12,2))
        info=f"Android {dev.android}   {dev.serial}"
        if dev.battery: info+=f"   🔋{dev.battery}%"
        ctk.CTkLabel(card,text=info,font=("Arial",10),text_color=T2
                     ).grid(row=1,column=1,sticky="w",pady=(0,12))
        ctk.CTkLabel(card,text=stxt,font=("Arial",10,"bold"),text_color=color
                     ).grid(row=0,column=2,rowspan=2,padx=16)
        if dev.status=="device":
            bf=ctk.CTkFrame(card,fg_color="transparent")
            bf.grid(row=0,column=3,rowspan=2,padx=(0,12))
            self._pb("Shopee",PRIMARY,PRI2,bf,lambda s=dev.serial:self._open_shopee(s),88,28).pack(pady=2)
            self._pb("Screenshot",SKY,"#0284c7",bf,lambda s=dev.serial:self._take_screenshot(s),88,28).pack(pady=2)

    # ══════════════════════════════════════════════════════
    #  SCREEN MIRROR  (non-scroll 5×4 grid, all 20 visible)
    # ══════════════════════════════════════════════════════

    def _build_mirror(self):
        page=ctk.CTkFrame(self._pf,fg_color=APP_BG,corner_radius=0)
        page.grid_columnconfigure(0,weight=1); page.grid_rowconfigure(1,weight=1)

        # ── Toolbar ──
        toolbar=ctk.CTkFrame(page,fg_color=WHITE,height=52,corner_radius=0)
        toolbar.grid(row=0,column=0,sticky="ew"); toolbar.grid_propagate(False)
        toolbar.grid_columnconfigure(0,weight=1); toolbar.grid_columnconfigure(4,weight=1)
        ctk.CTkFrame(page,height=1,fg_color=BORDER).grid(row=0,column=0,sticky="sew")

        ctr=ctk.CTkFrame(toolbar,fg_color="transparent")
        ctr.grid(row=0,column=1,columnspan=3,pady=9)
        self._pb("▶  Start All",EMERALD,"#0da271",ctr,self._mirror_start_all,120,bold=True,tc="#000"
                 ).pack(side="left",padx=(0,6))
        self._pb("⏹  Stop All",SURF,HOVER,ctr,self._mirror_stop_all,110,tc=ROSE
                 ).pack(side="left",padx=(0,16))
        ctk.CTkFrame(ctr,width=1,height=20,fg_color=BORDER).pack(side="left",padx=(0,12))
        self._mirror_status_lbl=ctk.CTkLabel(ctr,text="0 / 0  streaming",
                                              font=("Arial",11,"bold"),text_color=T3)
        self._mirror_status_lbl.pack(side="left")
        ctk.CTkLabel(toolbar,text="Click cell → Fullscreen   •   20 devices max",
                     font=("Arial",10),text_color=T4).grid(row=0,column=4,padx=16,sticky="e")

        # ── Grid (non-scrollable 5×4) ──
        self._mgrid_outer=ctk.CTkFrame(page,fg_color=APP_BG,corner_radius=0)
        self._mgrid_outer.grid(row=1,column=0,sticky="nsew")
        self._mgrid_outer.grid_columnconfigure(0,weight=1)
        self._mgrid_outer.grid_rowconfigure(0,weight=1)

        self._mgrid=ctk.CTkFrame(self._mgrid_outer,fg_color=APP_BG,corner_radius=0)
        self._mgrid.grid(row=0,column=0,sticky="nsew",padx=8,pady=8)
        for c in range(self.GCOLS): self._mgrid.grid_columnconfigure(c,weight=1,uniform="c")
        for r in range(self.GROWS): self._mgrid.grid_rowconfigure(r,weight=1,uniform="r")

        for i in range(self.GCOLS*self.GROWS):
            self._mirror_slots.append(
                self._make_slot(i//self.GCOLS, i%self.GCOLS, i))

        # ── Fullscreen overlay ──
        self._fs_outer=ctk.CTkFrame(page,fg_color=APP_BG,corner_radius=0)
        self._fs_outer.grid_columnconfigure(1,weight=1); self._fs_outer.grid_rowconfigure(1,weight=1)

        fsb=ctk.CTkFrame(self._fs_outer,fg_color=WHITE,corner_radius=0,height=52)
        fsb.grid(row=0,column=0,columnspan=2,sticky="ew"); fsb.grid_propagate(False)
        fsb.grid_columnconfigure(1,weight=1)
        self._pb("◀  Grid",SURF,HOVER,fsb,self._mirror_back_to_grid,96
                 ).grid(row=0,column=0,padx=14,pady=10)
        self._fs_title=ctk.CTkLabel(fsb,text="",font=("Arial",14,"bold"),text_color=T0)
        self._fs_title.grid(row=0,column=1,padx=8,sticky="w")
        self._fs_fps=ctk.CTkLabel(fsb,text="",font=("Arial",11,"bold"),text_color=EMERALD)
        self._fs_fps.grid(row=0,column=2,padx=16)
        ctk.CTkFrame(self._fs_outer,height=1,fg_color=BORDER).grid(row=0,column=0,columnspan=2,sticky="sew")

        fp=ctk.CTkFrame(self._fs_outer,fg_color="#000",corner_radius=20,
                         width=self.FS_W+14,height=self.FS_H+14)
        fp.grid(row=1,column=0,padx=(18,8),pady=18,sticky="ns"); fp.grid_propagate(False)
        self._fs_lbl=ctk.CTkLabel(fp,text="📱",font=("Arial",30),text_color=T3,
                                   width=self.FS_W,height=self.FS_H)
        self._fs_lbl.place(relx=.5,rely=.5,anchor="center")
        self._fs_lbl.configure(cursor="crosshair")
        self._fs_lbl.bind("<ButtonPress-1>",self._fs_press)
        self._fs_lbl.bind("<ButtonRelease-1>",self._fs_release)
        self._fs_lbl.bind("<Button-3>",lambda e:self._fs_key("back"))

        fc=ctk.CTkFrame(self._fs_outer,fg_color="transparent")
        fc.grid(row=1,column=1,padx=(0,18),pady=18,sticky="nsew"); fc.grid_columnconfigure(0,weight=1)

        cb=ctk.CTkFrame(fc,fg_color=CARD,corner_radius=16,border_width=1,border_color=BORDER)
        cb.grid(row=0,column=0,sticky="ew")
        ctk.CTkLabel(cb,text="Controls",font=("Arial",11,"bold"),text_color=T2).pack(pady=(14,8))
        r1=ctk.CTkFrame(cb,fg_color="transparent"); r1.pack(padx=12,pady=(0,6))
        for i,(lbl,k,col) in enumerate([("← Back","back",T1),("○ Home","home",SKY),
                                          ("□ App","recents",T2),("⏻","power",AMBER)]):
            ctk.CTkButton(r1,text=lbl,width=82,height=30,fg_color=SURF,
                          text_color=col,font=("Arial",11),hover_color=HOVER,
                          corner_radius=8,command=lambda x=k:self._fs_key(x)
                          ).grid(row=0,column=i,padx=2)
        r2=ctk.CTkFrame(cb,fg_color="transparent"); r2.pack(padx=12,pady=(0,14))
        for i,(lbl,k) in enumerate([("Vol +","vol_up"),("Vol −","vol_down")]):
            ctk.CTkButton(r2,text=lbl,width=128,height=28,fg_color=SURF,
                          text_color=T1,font=("Arial",11),hover_color=HOVER,
                          corner_radius=8,command=lambda x=k:self._fs_key(x)
                          ).grid(row=0,column=i,padx=2)

        ctk.CTkLabel(fc,text="Click = Tap   Right-click = Back   Drag = Swipe",
                     font=("Arial",9),text_color=T4).grid(row=1,column=0,sticky="w",pady=(8,6))
        self._pb("📸  Screenshot",SURF,HOVER,fc,
                 lambda:self._take_screenshot(self._mirror_fs_serial),h=34
                 ).grid(row=2,column=0,sticky="ew")
        self._fs_res=ctk.CTkLabel(fc,text="",font=("Arial",9),text_color=T4)
        self._fs_res.grid(row=3,column=0,sticky="w",pady=(8,0))

        self._pages["mirror"]=page

    def _make_slot(self,row:int,col:int,idx:int)->dict:
        frame=ctk.CTkFrame(self._mgrid,fg_color=CARD,corner_radius=12,
                            border_width=1,border_color=BORDER)
        frame.grid(row=row,column=col,padx=4,pady=4,sticky="nsew")
        frame.grid_columnconfigure(0,weight=1); frame.grid_rowconfigure(0,weight=1)

        # Thumbnail area
        ta=ctk.CTkFrame(frame,fg_color=SURF,corner_radius=8)
        ta.grid(row=0,column=0,padx=5,pady=(5,3),sticky="nsew")
        ta.grid_columnconfigure(0,weight=1); ta.grid_rowconfigure(0,weight=1)
        thumb=ctk.CTkLabel(ta,text=str(idx+1),font=("Arial",22,"bold"),
                            text_color=T4,cursor="hand2")
        thumb.grid(row=0,column=0,sticky="nsew")

        # Info bar
        info=ctk.CTkFrame(frame,fg_color=SURF,corner_radius=6,height=28)
        info.grid(row=1,column=0,padx=5,pady=(0,5),sticky="ew")
        info.grid_propagate(False); info.grid_columnconfigure(1,weight=1)
        dot=ctk.CTkLabel(info,text="●",font=("Arial",8),text_color=T4,width=10)
        dot.grid(row=0,column=0,padx=(6,2),sticky="w")
        name_lbl=ctk.CTkLabel(info,text="Empty",font=("Arial",8),text_color=T3,anchor="w")
        name_lbl.grid(row=0,column=1,sticky="w")
        fps_lbl=ctk.CTkLabel(info,text="",font=("Arial",8),text_color=T3)
        fps_lbl.grid(row=0,column=2,padx=3)
        btn=ctk.CTkButton(info,text="▶",width=22,height=18,fg_color=PRI3,
                           text_color=PRIMARY,font=("Arial",9),corner_radius=4,
                           state="disabled",command=lambda i=idx:self._toggle_slot(i))
        btn.grid(row=0,column=3,padx=(0,4))

        return {"frame":frame,"lbl":thumb,"fps_lbl":fps_lbl,"name_lbl":name_lbl,
                "dot":dot,"btn":btn,"serial":None,"img_ref":None,"last_update":0}

    # ── Grid management ───────────────────────────────────

    def _update_mirror_devices(self,devices:list[Device]):
        connected={d.serial:d for d in devices if d.status=="device"}
        mapped=set(self._mirror_slot_map.keys())
        for s in mapped-set(connected.keys()): self._unassign(s)
        for s,d in connected.items():
            if s not in self._mirror_slot_map: self._assign(s,d.model or d.serial)
        self._mirror_update_status()

    def _assign(self,serial:str,name:str):
        for i,slot in enumerate(self._mirror_slots):
            if slot["serial"] is None:
                slot["serial"]=serial; slot["name"]=name
                self._mirror_slot_map[serial]=i
                slot["frame"].configure(border_color=PRI2)
                slot["lbl"].configure(text="📱",font=("Arial",20),
                                       text_color=PRIMARY,cursor="hand2")
                slot["lbl"].bind("<Button-1>",lambda e,s=serial:self._open_fs(s))
                slot["name_lbl"].configure(text=name[:14],text_color=T1)
                slot["fps_lbl"].configure(text="Ready",text_color=T3)
                slot["dot"].configure(text_color=T3)
                slot["btn"].configure(text="▶",state="normal",fg_color=PRI3,
                                       text_color=PRIMARY,
                                       command=lambda s=serial:self._toggle_one(s))
                self._mirror_cells[serial]=slot; break

    def _unassign(self,serial:str):
        m=self._mirrors.pop(serial,None)
        if m: m.stop()
        idx=self._mirror_slot_map.pop(serial,None)
        self._mirror_cells.pop(serial,None)
        if idx is None: return
        slot=self._mirror_slots[idx]; slot["serial"]=None; slot["img_ref"]=None
        slot["frame"].configure(border_color=BORDER)
        slot["lbl"].configure(image=None,text=str(idx+1),
                               font=("Arial",22,"bold"),text_color=T4,cursor="")
        slot["lbl"].unbind("<Button-1>")
        slot["name_lbl"].configure(text="Empty",text_color=T3)
        slot["fps_lbl"].configure(text=""); slot["dot"].configure(text_color=T4)
        slot["btn"].configure(text="▶",state="disabled",fg_color=PRI3,text_color=T4)

    def _mirror_start_all(self):
        for s in list(self._mirror_cells.keys()): self._start_one(s)

    def _mirror_stop_all(self):
        for s in list(self._mirrors.keys()): self._stop_one(s)

    def _toggle_slot(self,idx:int):
        s=self._mirror_slots[idx]["serial"]
        if s: self._toggle_one(s)

    def _toggle_one(self,serial:str):
        if serial in self._mirrors and self._mirrors[serial].is_running:
            self._stop_one(serial)
        else: self._start_one(serial)

    def _start_one(self,serial:str):
        if serial not in self._mirror_cells: return
        m=self._mirrors.get(serial)
        if not m:
            m=ScreenMirror(self.adb); self._mirrors[serial]=m
        if m.is_running: return
        m.on_frame=lambda img,fps,s=serial:self._frame_grid(s,img,fps)
        m.start(serial); self._cell_state(serial,True); self._mirror_update_status()

    def _stop_one(self,serial:str):
        m=self._mirrors.get(serial)
        if m: m.stop()
        self._cell_state(serial,False); self._mirror_update_status()

    def _cell_state(self,serial:str,running:bool):
        cell=self._mirror_cells.get(serial)
        if not cell: return
        if running:
            cell["frame"].configure(border_width=2,border_color=EMERALD)
            cell["dot"].configure(text_color=EMERALD)
            cell["fps_lbl"].configure(text="live",text_color=EMERALD)
            cell["btn"].configure(text="⏹",text_color=ROSE)
        else:
            cell["frame"].configure(border_width=1,border_color=PRI2)
            cell["dot"].configure(text_color=T3)
            cell["fps_lbl"].configure(text="Ready",text_color=T3)
            cell["btn"].configure(text="▶",text_color=PRIMARY)
            cell["lbl"].configure(image=None,text="📱"); cell["img_ref"]=None

    def _mirror_update_status(self):
        r=sum(1 for m in self._mirrors.values() if m.is_running)
        t=len(self._mirror_cells)
        self._mirror_status_lbl.configure(
            text=f"{r} / {t}  streaming",
            text_color=EMERALD if r else T3)

    def _frame_grid(self,serial:str,img,fps:int):
        cell=self._mirror_cells.get(serial)
        if not cell: return
        if self._mirror_fs_serial==serial: self._frame_fs(img,fps); return
        now=time.time()
        if now-cell["last_update"]<0.18: return
        cell["last_update"]=now
        m=self._mirrors.get(serial)
        try:
            from PIL import Image as PI
            lbl=cell["lbl"]
            tw=max(lbl.winfo_width(),60); th=max(lbl.winfo_height(),100)
            ci=ctk.CTkImage(light_image=img.resize((tw,th),PI.BILINEAR),
                             dark_image=img.resize((tw,th),PI.BILINEAR),size=(tw,th))
            def _u(c=cell,i=ci,f=fps,mx=m):
                c["img_ref"]=i; c["lbl"].configure(image=i,text="")
                c["fps_lbl"].configure(text=f"{f}fps")
                if mx: mx.mark_rendered()
            self.root.after(0,_u)
        except Exception:
            if m: m.mark_rendered()

    def _open_fs(self,serial:str):
        if serial not in self._mirror_cells: return
        self._mirror_fs_serial=serial
        cell=self._mirror_cells[serial]
        self._fs_title.configure(text=f"📱  {cell['name']}")
        self._fs_fps.configure(text=""); self._fs_res.configure(text="")
        self._fs_lbl.configure(image=None,text="📱")
        if serial not in self._mirrors or not self._mirrors[serial].is_running:
            self._start_one(serial)
        self._mgrid_outer.grid_remove()
        self._fs_outer.grid(row=1,column=0,sticky="nsew")

    def _mirror_back_to_grid(self):
        self._mirror_fs_serial=""
        self._fs_outer.grid_remove()
        self._mgrid_outer.grid(row=1,column=0,sticky="nsew")

    def _frame_fs(self,img,fps:int):
        m=self._mirrors.get(self._mirror_fs_serial)
        try:
            from PIL import Image as PI
            ci=ctk.CTkImage(light_image=img.resize((self.FS_W,self.FS_H),PI.BILINEAR),
                             dark_image=img.resize((self.FS_W,self.FS_H),PI.BILINEAR),
                             size=(self.FS_W,self.FS_H))
            def _u(i=ci,f=fps,mx=m):
                self._mirror_img=i; self._fs_lbl.configure(image=i,text="")
                self._fs_fps.configure(text=f"● {f} fps")
                if mx: self._fs_res.configure(text=f"{mx.phone_w}×{mx.phone_h}"); mx.mark_rendered()
            self.root.after(0,_u)
        except Exception:
            if m: m.mark_rendered()

    def _fs_press(self,e): self._drag_start=(e.x,e.y)
    def _fs_release(self,e):
        if not self._drag_start: return
        dx=abs(e.x-self._drag_start[0]); dy=abs(e.y-self._drag_start[1])
        m=self._mirrors.get(self._mirror_fs_serial)
        if not m: self._drag_start=None; return
        if dx<6 and dy<6:
            px=int(e.x/self.FS_W*m.phone_w); py=int(e.y/self.FS_H*m.phone_h); m.tap(px,py)
        else:
            x1=int(self._drag_start[0]/self.FS_W*m.phone_w)
            y1=int(self._drag_start[1]/self.FS_H*m.phone_h)
            x2=int(e.x/self.FS_W*m.phone_w); y2=int(e.y/self.FS_H*m.phone_h)
            m.swipe(x1,y1,x2,y2,300)
        self._drag_start=None
    def _fs_key(self,k):
        m=self._mirrors.get(self._mirror_fs_serial)
        if m and hasattr(m,k): getattr(m,k)()

    # ══════════════════════════════════════════════════════
    #  QUEUE
    # ══════════════════════════════════════════════════════

    def _build_queue(self):
        pg=ctk.CTkFrame(self._pf,fg_color=APP_BG,corner_radius=0)
        pg.grid_columnconfigure(0,weight=1); pg.grid_rowconfigure(1,weight=1)
        tb=ctk.CTkFrame(pg,fg_color="transparent")
        tb.grid(row=0,column=0,padx=16,pady=16,sticky="ew")
        ctk.CTkLabel(tb,text="Product Queue",font=("Arial",15,"bold"),text_color=T0).pack(side="left")
        self._pb("Clear",SURF,HOVER,tb,self._clear_queue,76,h=30,tc=ROSE).pack(side="right")
        self._qf=ctk.CTkScrollableFrame(pg,fg_color=CARD,corner_radius=16,
                                         border_width=1,border_color=BORDER,label_text="")
        self._qf.grid(row=1,column=0,padx=16,pady=(0,16),sticky="nsew")
        self._qf.grid_columnconfigure(0,weight=1)
        self._q_empty=ctk.CTkLabel(self._qf,text="Queue is empty",font=("Arial",13),text_color=T3)
        self._q_empty.pack(pady=50)
        self._q_rows:dict={}; self._pages["queue"]=pg

    # ══════════════════════════════════════════════════════
    #  AUTO PILOT
    # ══════════════════════════════════════════════════════

    def _build_autopilot(self):
        pg=ctk.CTkFrame(self._pf,fg_color=APP_BG,corner_radius=0)
        pg.grid_columnconfigure(0,weight=1); pg.grid_rowconfigure(1,weight=1)
        ctrl=ctk.CTkFrame(pg,fg_color=CARD,corner_radius=16,
                           border_width=1,border_color=BORDER)
        ctrl.grid(row=0,column=0,padx=16,pady=16,sticky="ew")
        ctrl.grid_columnconfigure(1,weight=1)

        hdr=ctk.CTkFrame(ctrl,fg_color="transparent")
        hdr.grid(row=0,column=0,columnspan=3,padx=20,pady=(18,10),sticky="ew")
        icon_circle(hdr,"🚀",PRIMARY,40).pack(side="left")
        ctk.CTkLabel(hdr,text="  Auto Pilot",font=("Arial",16,"bold"),text_color=T0).pack(side="left")

        ctk.CTkLabel(ctrl,text="Device:",font=("Arial",11),text_color=T2
                     ).grid(row=1,column=0,padx=(20,8),pady=8,sticky="w")
        self._pilot_dv=ctk.StringVar(value="No device")
        self._pilot_dm=ctk.CTkOptionMenu(ctrl,variable=self._pilot_dv,values=["No device"],
                                          fg_color=SURF,button_color=SURF,
                                          button_hover_color=HOVER,
                                          text_color=T1,font=("Arial",11),width=220)
        self._pilot_dm.grid(row=1,column=1,padx=8,pady=8,sticky="w")
        self._pb("⟳",SURF,HOVER,ctrl,self._refresh_pilot,36,32).grid(row=1,column=2,padx=(0,20))

        sf=ctk.CTkFrame(ctrl,fg_color="transparent")
        sf.grid(row=2,column=0,columnspan=3,padx=20,pady=(2,12),sticky="ew")
        self._pq=self._mstat(sf,"Queue","0",AMBER,0)
        self._pd=self._mstat(sf,"Done","0",EMERALD,1)
        self._pe=self._mstat(sf,"Errors","0",ROSE,2)

        self._pcur=ctk.CTkLabel(ctrl,text="Waiting to start…",font=("Arial",11),text_color=T2)
        self._pcur.grid(row=3,column=0,columnspan=3,padx=20,pady=(0,8),sticky="w")
        self._pbtn=ctk.CTkButton(ctrl,text="▶   Start Auto Pilot",height=44,
                                  fg_color=PRIMARY,text_color=WHITE,
                                  font=("Arial",13,"bold"),hover_color=PRI2,
                                  corner_radius=12,command=self._toggle_pilot)
        self._pbtn.grid(row=4,column=0,columnspan=3,padx=20,pady=(4,20),sticky="ew")

        self._ppf=ctk.CTkScrollableFrame(pg,fg_color=CARD,corner_radius=16,
                                          border_width=1,border_color=BORDER,label_text="")
        self._ppf.grid(row=1,column=0,padx=16,pady=(0,16),sticky="nsew")
        self._ppf.grid_columnconfigure(0,weight=1)
        self._prows:dict={}; self._pages["autopilot"]=pg

    def _mstat(self,p,label,val,color,col):
        f=ctk.CTkFrame(p,fg_color=SURF,corner_radius=20,border_width=1,border_color=BORDER)
        f.grid(row=0,column=col,padx=(0,8),ipadx=12,ipady=4)
        ctk.CTkLabel(f,text=label,font=("Arial",10),text_color=T3).pack(side="left")
        v=ctk.CTkLabel(f,text=f"  {val}",font=("Arial",13,"bold"),text_color=color)
        v.pack(side="left"); return v

    # ══════════════════════════════════════════════════════
    #  SETTINGS
    # ══════════════════════════════════════════════════════

    def _build_settings(self):
        outer=ctk.CTkScrollableFrame(self._pf,fg_color=APP_BG,corner_radius=0)
        outer.grid_columnconfigure((0,1),weight=1)

        def sec(title,row,col,cs=1):
            pl=16 if col==0 else 8; pr=8 if(col==0 and cs==1)else 16
            f=ctk.CTkFrame(outer,fg_color=CARD,corner_radius=16,
                            border_width=1,border_color=BORDER)
            f.grid(row=row,column=col,columnspan=cs,padx=(pl,pr),pady=(14,0),sticky="nsew")
            sh=ctk.CTkFrame(f,fg_color=SURF,corner_radius=13,height=40)
            sh.pack(fill="x"); sh.pack_propagate(False)
            ctk.CTkLabel(sh,text=title,font=("Arial",11,"bold"),text_color=T0
                         ).pack(side="left",padx=16)
            body=ctk.CTkFrame(f,fg_color="transparent")
            body.pack(fill="both",expand=True,padx=16,pady=14); return body

        def erow(p,label,key,show="",r=0,secret=False):
            ctk.CTkLabel(p,text=label,font=("Arial",11),text_color=T2
                         ).grid(row=r,column=0,sticky="w",pady=5)
            ph = "(stored in .env — leave to keep)" if secret else ""
            e=ctk.CTkEntry(p,width=240,fg_color=SURF,border_color=BORDER,
                            text_color=T1,show=show,placeholder_text=ph)
            if secret:
                # Show a mask if configured (via .env); never reveal the real value
                if self.settings.get(key): e.insert(0,cfg.MASK)
            else:
                e.insert(0,str(self.settings.get(key,"")))
            e.grid(row=r,column=1,padx=(10,0),pady=5,sticky="ew")
            p.grid_columnconfigure(1,weight=1); return e

        def orow(p,label,key,choices,r=0):
            ctk.CTkLabel(p,text=label,font=("Arial",11),text_color=T2
                         ).grid(row=r,column=0,sticky="w",pady=5)
            var=ctk.StringVar(value=str(self.settings.get(key,choices[0])))
            ctk.CTkOptionMenu(p,variable=var,values=choices,
                              fg_color=SURF,button_color=SURF,
                              button_hover_color=HOVER,text_color=T1,
                              font=("Arial",11),width=200
                              ).grid(row=r,column=1,padx=(10,0),pady=5,sticky="w")
            p.grid_columnconfigure(1,weight=1); return var

        ab=sec("🔑  API Keys",0,0)
        self._ec=erow(ab,"Claude API Key","claude_api_key",show="*",r=0,secret=True)
        self._eg=erow(ab,"Google AI Key","google_api_key",show="*",r=1,secret=True)
        sb=sec("⚙️  App Config",0,1)
        self._ep=erow(sb,"Server Port","server_port",r=0)
        self._es=erow(sb,"Shop Name","shop_name",r=1)
        self._emi=erow(sb,"Min Delay (sec)","post_delay_min",r=2)
        self._ema=erow(sb,"Max Delay (sec)","post_delay_max",r=3)
        vb=sec("🎬  Video Settings",1,0,cs=2)
        self._va=orow(vb,"Audience","age_group",["All Ages","Gen Z","Millennial","Adult"],0)
        self._vp=orow(vb,"Personality","personality",["Fun","Serious","Friendly","Luxury"],1)
        self._vst=orow(vb,"Style","style",["Lifestyle","Review","Compare","Comedy"],2)
        self._vb=orow(vb,"Background","background",["Studio","Outdoor","Home","Office"],3)
        self._vd=orow(vb,"Duration","duration",["6","8","12","15"],4)

        ctk.CTkButton(outer,text="💾   Save Settings",height=44,
                      fg_color=PRIMARY,text_color=WHITE,
                      font=("Arial",13,"bold"),hover_color=PRI2,
                      corner_radius=12,command=self._save_settings
                      ).grid(row=2,column=0,columnspan=2,padx=16,pady=14,sticky="ew")
        self._pages["settings"]=outer

    # ══════════════════════════════════════════════════════
    #  DEVICE ACTIONS
    # ══════════════════════════════════════════════════════

    def _scan_devices(self):
        self._log("Scanning…")
        threading.Thread(target=lambda:self.root.after(0,lambda:self._update_device_list(self.adb.scan())),daemon=True).start()

    def _update_device_list(self,devices:list[Device]):
        for w in self._devlist.winfo_children(): w.destroy()
        if not devices:
            ctk.CTkLabel(self._devlist,text="No devices found",
                         font=("Arial",12),text_color=T3).pack(pady=50)
            self._update_stats(devices=0); self._update_pilot_devices([]); return
        self._update_stats(devices=len(devices))
        self._update_pilot_devices(devices); self._update_mirror_devices(devices)
        self._log(f"Found {len(devices)} device(s)")
        for d in devices: self._device_card(d)

    def _wifi_connect(self):
        ip=self._wifi_ip.get().strip()
        if not ip: return
        threading.Thread(target=lambda:self.adb.connect_wifi(ip),daemon=True).start()
        self._log(f"WiFi ADB: {ip}…"); self.root.after(3000,self._scan_devices)

    def _open_shopee(self,s): self._log(f"[{s}] Shopee {'✓' if self.adb.open_shopee(s) else '✗'}")
    def _take_screenshot(self,serial:str):
        if not serial: return
        def _do():
            data=self.adb.screenshot(serial)
            if data:
                path=cfg.DATA_DIR/f"screen_{serial}_{int(time.time())}.png"; path.write_bytes(data)
                self.root.after(0,lambda:self._log(f"Saved → {path.name}"))
            else: self.root.after(0,lambda:self._log("Screenshot failed"))
        threading.Thread(target=_do,daemon=True).start()

    # ══════════════════════════════════════════════════════
    #  QUEUE / WORKER callbacks
    # ══════════════════════════════════════════════════════

    def _on_products_received(self,products:list):
        self.root.after(0,lambda:self._add_to_queue(products))

    def _add_to_queue(self,products:list):
        self._q_empty.pack_forget(); self._worker.add_products(products)
        for p in products:
            pid=p.get("product_id","?")
            name=p.get("basic_info",{}).get("name","Unknown") or "Unknown"
            price=p.get("basic_info",{}).get("price","-")
            comm=p.get("commission",{}).get("rate","-")
            row=ctk.CTkFrame(self._qf,fg_color=SURF,corner_radius=12,
                              border_width=1,border_color=BORDER)
            row.pack(fill="x",padx=10,pady=3); row.grid_columnconfigure(0,weight=1)
            ctk.CTkLabel(row,text=name[:62],font=("Arial",12),text_color=T0
                         ).grid(row=0,column=0,sticky="w",padx=14,pady=(10,3))
            ctk.CTkLabel(row,text=f"฿{price}  •  {comm}% commission",
                         font=("Arial",10),text_color=T2
                         ).grid(row=1,column=0,sticky="w",padx=14,pady=(0,10))
            badge=ctk.CTkLabel(row,text="Pending",font=("Arial",9,"bold"),
                                text_color=T2,fg_color=HOVER,corner_radius=20,padx=10,pady=3)
            badge.grid(row=0,column=1,rowspan=2,padx=12)
            self._q_rows[pid]=badge; self._add_prow(pid,name)
        count=len(self._worker.queue)
        self._update_stats(queue=count); self._pq.configure(text=str(count))
        self._log(f"Added {len(products)} to queue (total {count})")

    def _clear_queue(self):
        self._worker.clear_queue()
        for w in self._qf.winfo_children(): w.destroy()
        self._q_rows.clear()
        self._q_empty=ctk.CTkLabel(self._qf,text="Queue is empty",font=("Arial",13),text_color=T3)
        self._q_empty.pack(pady=50)
        self._update_stats(queue=0); self._pq.configure(text="0"); self._log("Queue cleared")

    def _add_prow(self,pid:str,name:str):
        if pid in self._prows: return
        row=ctk.CTkFrame(self._ppf,fg_color=SURF,corner_radius=12,
                          border_width=1,border_color=BORDER)
        row.pack(fill="x",padx=10,pady=3); row.grid_columnconfigure(0,weight=1)
        ctk.CTkLabel(row,text=name[:58],font=("Arial",11),text_color=T1
                     ).grid(row=0,column=0,sticky="w",padx=14,pady=10)
        badge=ctk.CTkLabel(row,text="Pending",font=("Arial",9,"bold"),
                            text_color=T2,fg_color=HOVER,corner_radius=20,padx=10,pady=3)
        badge.grid(row=0,column=1,padx=12); self._prows[pid]=badge

    def _on_worker_status(self,pid:str,status:str):
        M={"pending":("Pending",T2),"generating":("Generating…",SKY),
           "posting":("Posting…",AMBER),"done":("✓ Done",EMERALD),"error":("✗ Error",ROSE)}
        text,color=M.get(status,(status,T2))
        def _u():
            if pid in self._q_rows: self._q_rows[pid].configure(text=text,text_color=color)
            if pid in self._prows: self._prows[pid].configure(text=text,text_color=color)
            self._pcur.configure(text=text,text_color=color)
        self.root.after(0,_u)

    def _on_worker_stats(self,done:int,err:int,ql:int):
        def _u():
            self._pd.configure(text=str(done)); self._pe.configure(text=str(err))
            self._pq.configure(text=str(ql)); self._update_stats(done=done,err=err,queue=ql)
        self.root.after(0,_u)

    def _on_worker_finished(self):
        def _u():
            self._pbtn.configure(text="▶   Start Auto Pilot",fg_color=PRIMARY,
                                  text_color=WHITE,hover_color=PRI2)
            self._pcur.configure(text="Completed ✓",text_color=EMERALD)
        self.root.after(0,_u)

    def _refresh_pilot(self): self._update_pilot_devices(self.adb.scan())

    def _update_pilot_devices(self,devices:list[Device]):
        c=[d for d in devices if d.status=="device"]
        if c:
            vals=[f"{d.model or d.serial} ({d.serial})" for d in c]
            self._pilot_dm.configure(values=vals); self._pilot_dv.set(vals[0])
        else:
            self._pilot_dm.configure(values=["No device"]); self._pilot_dv.set("No device")

    def _get_serial(self)->str:
        import re; m=re.search(r"\((.+?)\)$",self._pilot_dv.get()); return m.group(1) if m else ""

    def _toggle_pilot(self):
        if self._worker.is_running:
            self._worker.stop()
            self._pbtn.configure(text="▶   Start Auto Pilot",fg_color=PRIMARY,
                                  text_color=WHITE,hover_color=PRI2)
        else:
            if self._worker.start(self._get_serial()):
                self._pbtn.configure(text="⏹   Stop",fg_color=ROSE,
                                      text_color=WHITE,hover_color="#c0304a")

    def _save_settings(self):
        # Secrets go to .env, not settings.json. Only write when the user typed
        # a new value — an unchanged field still shows cfg.MASK.
        for entry,field in ((self._ec,"claude_api_key"),(self._eg,"google_api_key")):
            val=entry.get()
            if val!=cfg.MASK:
                cfg.set_secret(field,val)
        self.settings.update({
            "server_port":int(self._ep.get() or 3001),"shop_name":self._es.get(),
            "post_delay_min":int(self._emi.get() or 30),"post_delay_max":int(self._ema.get() or 120),
            "age_group":self._va.get(),"personality":self._vp.get(),
            "style":self._vst.get(),"background":self._vb.get(),
            "duration":int(self._vd.get())})
        cfg.save(self.settings)
        # Reload so in-memory settings (and worker) pick up the real keys from .env
        self.settings.update(cfg.load())
        self._worker.settings=self.settings; self._log("Settings saved ✓")

    # ══════════════════════════════════════════════════════
    #  LOG / STATS / REFRESH
    # ══════════════════════════════════════════════════════

    def _log(self,msg:str):
        def _do():
            t=datetime.now().strftime("%H:%M:%S")
            self._log_box.configure(state="normal")
            self._log_box.insert("end",f"[{t}]  {msg}\n")
            self._log_box.see("end"); self._log_box.configure(state="disabled")
        try: self.root.after(0,_do)
        except: pass

    def _update_stats(self,devices=None,queue=None,done=None,err=None):
        if devices is not None:
            self._stats["stat_devices"].configure(text=str(devices))
            self._tb_dev.configure(text=f"  {devices}")
        if queue is not None:
            self._stats["stat_queue"].configure(text=str(queue))
            self._tb_q.configure(text=f"  {queue}")
        if done is not None: self._stats["stat_done"].configure(text=str(done))
        if err  is not None: self._stats["stat_err"].configure(text=str(err))

    def _start_refresh(self):
        def _tick():
            threading.Thread(target=self._bg,daemon=True).start()
            self.root.after(5000,_tick)
        self.root.after(2000,_tick)

    def _bg(self):
        devs=self.adb.scan(); c=[d for d in devs if d.status=="device"]
        self.root.after(0,lambda:self._update_stats(devices=len(c)))
        self.root.after(0,lambda:self._update_pilot_devices(devs))
        self.root.after(0,lambda:self._update_mirror_devices(devs))

    # ── Button factory ────────────────────────────────────

    def _pb(self,text,fg,hv,parent,cmd,w=None,h=36,bold=False,tc=WHITE):
        kw=dict(text=text,fg_color=fg,hover_color=hv,text_color=tc,
                font=("Arial",11,"bold") if bold else ("Arial",11),
                height=h,corner_radius=8,command=cmd)
        if w: kw["width"]=w
        return ctk.CTkButton(parent,**kw)
