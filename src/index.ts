import { Application, InteractionEvent, Point, IResourceDictionary, Loader, Sprite, Graphics, DisplayObject } from 'pixi.js';
import * as math from 'mathjs';
import bkgdPath from './assets/bkgd.jpg';


enum DrawStatus {
    READY,
    DRAWING,
    DONE
}

// 边
interface Edge {
    from: Point,
    to?: Point,
    crossPoints?: Point[]
}

// 结点
interface Node {
    point: Point,
    neighbor: Node[],
    status?: boolean
}

// pixi
let app: Application;
let loader: Loader;
let resources: IResourceDictionary;
let scale: number;

// 元素
let bkgd: Sprite;
let jiujiuGraph: Graphics;
let line: Graphics;

// 参数
let drawStatus: DrawStatus;
let edges: Edge[];
let redLine: DisplayObject[];


// tools functions

// 绘制交叉
function testCross(p, q) {
    line = new Graphics();
    line.lineStyle(2, 0x0033ff, 1);
    line.moveTo(p.from.x, p.from.y);
    line.lineTo(p.to.x, p.to.y)
    app.stage.addChild(line);

    line = new Graphics();
    line.lineStyle(2, 0x0033ff, 1);
    line.moveTo(q.from.x, q.from.y);
    line.lineTo(q.to.x, q.to.y)
    app.stage.addChild(line);
}

const _removePoints = (edges: Edge[]): void => {
    let p: Edge, q: Edge;
    for (let i = 0; i < edges.length - 1; ++i) {
        p = edges[i];
        if (p.from.equals(p.to)) {
            // 这是一个点，删除
            edges.splice(i, 1);
            --i;
            continue;
        }
    }
}


/**
 * 快速排斥实验，判断两个边是否不相交
 * @param p 边p
 * @param q 边q
 */
const _kspc = (p: Edge, q: Edge) => {
    return (Math.min(p.from.x, p.to.x) <= Math.max(q.from.x, q.to.x) &&
        Math.min(q.from.x, q.to.x) <= Math.max(p.from.x, p.to.x) &&
        Math.min(p.from.y, p.to.y) <= Math.max(q.from.y, q.to.y) &&
        Math.min(q.from.y, q.to.y) <= Math.max(p.from.y, p.to.y));
}

/**
 * 跨立实验，判断两个边是否有交点
 * @param p 边p
 * @param q 边q
 */
const _kl = (p: Edge, q: Edge) => {
    return (
        math.dot(math.cross([p.from.x - q.from.x, p.from.y - q.from.y, 0], [q.to.x - q.from.x, q.to.y - q.from.y, 0]),
            math.cross([q.to.x - q.from.x, q.to.y - q.from.y, 0], [p.to.x - q.from.x, p.to.y - q.from.y, 0])) >= 0 &&
        math.dot(math.cross([q.from.x - p.from.x, q.from.y - p.from.y, 0], [p.to.x - p.from.x, p.to.y - p.from.y, 0]),
            math.cross([p.to.x - p.from.x, p.to.y - p.from.y, 0], [q.to.x - p.from.x, q.to.y - p.from.y, 0])) >= 0
    );
}

const _calCross = (p: Edge, q: Edge) => {
    const fromFrac = (math.norm(math.cross([q.from.x - p.from.x, q.from.y - p.from.y, 0], [p.to.x - p.from.x, p.to.y - p.from.y, 0])) as number) / ((math.norm([p.to.x - p.from.x, p.to.y - p.from.y])) as number);
    const toFrac = (math.norm(math.cross([q.to.x - p.from.x, q.to.y - p.from.y, 0], [p.to.x - p.from.x, p.to.y - p.from.y, 0])) as number) / ((math.norm([p.to.x - p.from.x, p.to.y - p.from.y])) as number);
    return new Point(q.from.x + fromFrac / (fromFrac + toFrac) * (q.to.x - q.from.x), q.from.y + fromFrac / (fromFrac + toFrac) * (q.to.y - q.from.y));
}

const _calculateCrossPoint = (edges: Edge[]) => {
    // 第一步： 判断两条线是否交叉，如果交叉，则求交点，并进行标记
    let p: Edge, q: Edge; // 两条边
    for (let i = 0; i < edges.length - 2; ++i) {
        p = edges[i];
        for (let j = i + 2; j < edges.length; ++j) {
            q = edges[j];
            // 是否满足快速排斥实验
            if (!_kspc(p, q)) {
                continue;
            }
            // 是否满足跨立实验
            if (_kl(p, q)) {
                // 交点：
                // testCross(p, q)
                console.log('cross', i, j, p, q);

                const crossPoint = _calCross(p, q);
                if (p.crossPoints) {
                    p.crossPoints.push(crossPoint);
                } else {
                    p.crossPoints = [crossPoint];
                }
                if (q.crossPoints) {
                    q.crossPoints.push(crossPoint);
                } else {
                    q.crossPoints = [crossPoint];
                }

            }
        }
    }
}

/**
 * 从结点列表中寻找特定的结点
 * @param nodes 
 * @param point 
 */
const _findPoint = (nodes: Node[], point: Point) => {
    return nodes.find(node => node.point.equals(point));
}

/**
 * 
 * @param edges 边，有交叉结点的信息
 */
const _constructGraph = (edges: Edge[]): Node => {
    let crossNodes: Node[] = []; // 所有交叉点集合
    let startNode: Node = {
        point: new Point(420 * scale, 1400 * scale),
        neighbor: []
    }

    let currNode = startNode; // currNode始终指向下一条边的头部
    let p: Edge;
    // 顺序是从前往后，除非有分叉
    for (let i = 0; i < edges.length; ++i) {
        p = edges[i]; // 第i条边
        if (!p.crossPoints) {
            // 不存在交叉
            currNode.neighbor.push({
                point: p.to,
                neighbor: [currNode]
            });
            currNode = currNode.neighbor[currNode.neighbor.length - 1];
        } else {
            // 如果存在交叉:
            // 交叉点去重
            console.log('prevscr', p.crossPoints);
            p.crossPoints = p.crossPoints.reduce((prev: Point[], curr: Point) => {
                if (!prev.some(pt => pt.equals(curr))) {
                    prev.push(curr);
                }
                return prev;
            }, []);

            // 交叉点排序
            p.crossPoints.sort((p1: Point, p2: Point) => {
                // 直线，所以距离使用距离起点的距离来判断
                return (Math.abs(p1.x - p.from.x) > Math.abs(p2.x - p.from.x)) || (Math.abs(p1.y - p.from.y) > Math.abs(p2.y - p.from.y)) ? 1 : -1;
            });

            // 第一个点是端点
            if (p.crossPoints[0].equals(p.from)) {
                p.crossPoints.shift();
                crossNodes.push(currNode);
            }
            // 对于所有的端点
            p.crossPoints.forEach(cp => {
                let tmpNode: Node = _findPoint(crossNodes, cp);
                // 如果当前的交叉点已经被创建
                if (tmpNode) {
                    currNode.neighbor.push(tmpNode);
                    tmpNode.neighbor.push(currNode);
                    currNode = tmpNode;
                } else {
                    currNode.neighbor.push({
                        point: cp,
                        neighbor: [currNode]
                    })
                    currNode = currNode.neighbor[currNode.neighbor.length - 1];
                    crossNodes.push(currNode);
                }
            })
            // 如果最后一个交叉点不是端点
            if (!p.crossPoints[p.crossPoints.length - 1]?.equals(p.to)) {
                currNode.neighbor.push({
                    point: p.to,
                    neighbor: [currNode]
                })
                currNode = currNode.neighbor[currNode.neighbor.length - 1];
            }

        }
    }
    console.log('crossnodes:', crossNodes);
    return startNode;
}

const _selectNextNode = (prevNode: Node, currNode: Node): Node => {
    // 注意： 数轴是反的
    let nextNodes = currNode.neighbor.filter(n => n !== prevNode);
    // 如果接下来的结点之中不只一个点
    if (nextNodes.length > 1) {
        nextNodes.sort((n1, n2) => {
            // prevNode => currNode; currNode => n1; currNode => n2;
            // 顺时针优先
            // 计算一下叉乘
            let cn1 = math.cross([currNode.point.x - prevNode.point.x, currNode.point.y - prevNode.point.y, 0], [n1.point.x - currNode.point.x, n1.point.y - currNode.point.y, 0])[2];
            let cn2 = math.cross([currNode.point.x - prevNode.point.x, currNode.point.y - prevNode.point.y, 0], [n2.point.x - currNode.point.x, n2.point.y - currNode.point.y, 0])[2];
            // console.log(n1, n2, cn1, cn2)
            if (cn1 * cn2 <= 0) {
                // 逆时针的在前边
                // console.log('cross');
                return cn2 - cn1;
            }
            // 都是逆时针的情况：
            if (cn1 > 0) {
                // 取cos最小的
                return math.dot([n1.point.x - currNode.point.x, n1.point.y - currNode.point.y], [currNode.point.x - prevNode.point.x, currNode.point.y - prevNode.point.y]) -
                    math.dot([n2.point.x - currNode.point.x, n2.point.y - currNode.point.y], [currNode.point.x - prevNode.point.x, currNode.point.y - prevNode.point.y]);

            }

            return math.dot([n2.point.x - currNode.point.x, n2.point.y - currNode.point.y], [currNode.point.x - prevNode.point.x, currNode.point.y - prevNode.point.y]) -
                math.dot([n1.point.x - currNode.point.x, n1.point.y - currNode.point.y], [currNode.point.x - prevNode.point.x, currNode.point.y - prevNode.point.y]);
        })
    }

    return nextNodes[0];
}

const _transversalGraph = (startNode: Node): Point[] => {
    // 选取初始点
    let prevNode: Node = {
        point: new Point(startNode.point.x, startNode.point.y + 1),
        neighbor: null
    };
    let currNode = startNode;

    let points: Point[] = [];
    for (let i = 0; i < edges.length * (edges.length - 1) / 2 + edges.length; ++i) {
        if (!currNode) {
            break;
        }
        points.push(currNode.point);
        [prevNode, currNode] = [currNode, _selectNextNode(prevNode, currNode)];
    }

    return points;
}

const _accompletePoints = (points: Point[], x: number, y: number, scale: number): void => {
    points.push(new Point(x * scale, y * scale));
}


const _drawByPoint = (points: Point[]) => {
    for (let i = 0; i < points.length - 1; ++i) {
        setTimeout(() => {
            line = new Graphics();
            line.lineStyle(4, 0x00ff00, 1);
            line.moveTo(points[i].x, points[i].y);
            line.lineTo(points[i + 1].x, points[i + 1].y);
            app.stage.addChild(line);
        }, i * 50)
    }
}

const _drawByEdge = (edges: Edge[]) => {
    for (let i = 0; i < edges.length; ++i) {
        line = new Graphics();
        line.lineStyle(4, 0x0000ff, 1);
        line.moveTo(edges[i].from.x, edges[i].from.y);
        line.lineTo(edges[i].to.x, edges[i].to.y);
        app.stage.addChild(line);
    }
}

const _drawByGraph = (root: Node) => {
    if (root.status) {
        return;
    }
    else {
        root.status = true;
        root.neighbor.filter(n => n !== root).forEach((n) => {
            line = new Graphics();
            line.lineStyle(4, 0x33068b, 1);
            line.moveTo(root.point.x, root.point.y);
            line.lineTo(n.point.x, n.point.y);
            app.stage.addChild(line);
            _drawByGraph(n);
        });

    }
}

// init functions
function initBasic(): void {
    scale = Math.min(window.innerWidth / 1080, window.innerHeight / 2340);
    app = new Application({
        width: 1080 * scale,
        height: 2340 * scale
    });
    app.renderer.autoDensity = true;
    document.body.appendChild(app.view);

    loader = new Loader();
    resources = loader.resources;

    drawStatus = DrawStatus.READY;
    redLine = [];
}

async function initRes(): Promise<void> {
    await new Promise((resolve, reject) => {
        loader.add('bkgd', bkgdPath)
            .load(() => {
                resolve('done')
            })
    })
    // load image 
    bkgd = new Sprite(
        resources['bkgd'].texture
    );

    let bkgdHidden = new Sprite(
        resources['bkgd'].texture
    );
    
    jiujiuGraph = new Graphics();
    jiujiuGraph.beginFill(0xf88d98);
    jiujiuGraph.drawPolygon([
        new Point(0, 144),
        new Point(176, 300),
        new Point(178, 176),
        new Point(118, 64)
    ])
    jiujiuGraph.endFill();
    jiujiuGraph.beginFill(0xe8464c);
    jiujiuGraph.drawPolygon([
        new Point(188, 0),
        new Point(316, 8),
        new Point(300, 300),
        new Point(176,300)
    ]);
    jiujiuGraph.endFill();
    jiujiuGraph.scale.set(0.5 * scale, 0.5 * scale);

    const rec = new Graphics();
    rec.beginFill(0x666666, 0.6)
    rec.drawRect(0, 0, 1080 * scale, 2340 * scale);
    rec.endFill();

    app.stage.addChild(bkgdHidden);
    app.stage.addChild(rec);
    app.stage.addChild(jiujiuGraph);
    app.stage.addChild(bkgd);

    bkgd.scale.set(scale, scale);
    bkgdHidden.scale.set(scale, scale);
    bkgd.interactive = true;

}

function initEvents(): void {
    const _startDraw = (e: InteractionEvent): void => {
        // 落在起点附近，可以开始画图
        if (drawStatus !== DrawStatus.READY) {
            return;
        }
        redLine = [];
        const { x, y } = e.data.global;
        const dist = 150 * scale;
        if (Math.abs(x - 420 * scale) < dist && Math.abs(y - (1400 * scale - dist)) < dist) {
            drawStatus = DrawStatus.DRAWING;
            edges = [
                {
                    from: new Point(420 * scale, 1400 * scale)
                }
            ];
            line = new Graphics();
            line.lineStyle(4, 0xff0000, 1);
            line.moveTo(420 * scale, 1400 * scale);
        }

    }

    const _drawing = (e: InteractionEvent): void => {
        if (drawStatus === DrawStatus.DRAWING) {
            line.lineTo(e.data.global.x, e.data.global.y);
            app.stage.addChild(line);
            redLine.push(line);
            line = new Graphics();
            line.lineStyle(4, 0xff0000, 1);
            line.moveTo(e.data.global.x, e.data.global.y);
            edges[edges.length - 1].to = e.data.global.clone();
            edges.push({
                from: e.data.global.clone()
            })

        }
    }

    const _endDraw = (e: InteractionEvent): void => {
        if (drawStatus === DrawStatus.DRAWING) {
            // 封闭图形
            line.lineTo(640 * scale, 1400 * scale);
            app.stage.addChild(line);
            redLine.push(line);
            edges[edges.length - 1].to = new Point(640 * scale, 1400 * scale);

            // 处理形状
            // 删除共线点
            _removePoints(edges);
            // _drawByEdge(edges);
            _calculateCrossPoint(edges);
            const root: Node = _constructGraph(edges);
            // _drawByGraph(root);
            const points: Point[] = _transversalGraph(root);
            // _drawByPoint(points);

            // 找到最高的点
            let jiujiu: number[] = [];
            for (let i = 0; i < points.length - 1; ++i) {
                if ((points[i].x - 536 * scale) * (points[i + 1].x - 536 * scale) <= 0) {
                    if (points[i].x === points[i + 1].x) {
                        jiujiu.push(Math.min(points[i].y, points[i + 1].y))
                    } else {
                        jiujiu.push(points[i].y + (536 * scale - points[i].x) / (points[i + 1].x - points[i].x) * (points[i + 1].y - points[i].y))
                    }
                }
            }
            
            
            jiujiuGraph.position.set(536 * scale - jiujiuGraph.width / 2, Math.min(...jiujiu) - jiujiuGraph.height * 0.8);

            // 头部填充
            let head = new Graphics();
            head.beginFill(0xe6e2dd);
            head.drawPolygon(points);
            head.endFill();
            app.stage.addChild(head);
            // 删除红线
            app.stage.removeChild(...redLine);

            // 补全路径
            _accompletePoints(points, 640, 1400, scale);
            _accompletePoints(points, 742, 1422, scale);
            _accompletePoints(points, 720, 1520, scale);
            _accompletePoints(points, 656, 1518, scale);
            _accompletePoints(points, 684, 1712, scale);
            _accompletePoints(points, 562, 1712, scale);
            _accompletePoints(points, 536, 1680, scale);
            _accompletePoints(points, 510, 1712, scale);
            _accompletePoints(points, 394, 1712, scale);
            _accompletePoints(points, 416, 1518, scale);
            _accompletePoints(points, 352, 1520, scale);
            _accompletePoints(points, 330, 1422, scale);

            let mask = new Graphics();
            mask.beginFill(0xffffff);
            mask.drawPolygon(points);
            mask.endFill();


            bkgd.mask = mask;

            drawStatus = DrawStatus.DONE;
        }

    }

    bkgd.on('mousedown', (e) => {
        _startDraw(e);
    });

    bkgd.on('mousemove', (e) => {
        _drawing(e);
    });

    bkgd.on('mouseup', (e) => {
        _endDraw(e);
    })


    bkgd.on('touchstart', (e) => {
        _startDraw(e);
    })

    bkgd.on('touchmove', (e) => {
        _drawing(e);
    })

    bkgd.on('touchend', (e) => {
        _endDraw(e);
    })


}

async function init() {
    initBasic();
    await initRes();
    initEvents();
}


init();
