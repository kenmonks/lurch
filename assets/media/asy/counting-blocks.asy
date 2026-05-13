/** 
*  Counting Blocks 
*  
*  Asymptote source for creating the svg diagram in chapter 13 of the lecture notes
*  illustrating a combinatorial proof by counting blocks in two different ways.
*/

unitsize(0.5cm);

pen myblue = 0.4*blue+0.6*white;
pen myorange = 0.4*orange + 0.6*white;

real t=0.3;
for (int i=0; i<=4; ++i) {
  fill((0+(1+t)*i,2)--(0+(1+t)*i,5)--(1+(1+t)*i,5)--(1+(1+t)*i,2)--cycle,myblue);
  fill((0+(1+t)*i,0)--(0+(1+t)*i,2)--(1+(1+t)*i,2)--(1+(1+t)*i,0)--cycle,myorange);
  draw((0+(1+t)*i,0)--(0+(1+t)*i,5)--(1+(1+t)*i,5)--(1+(1+t)*i,0)--cycle);
  for (int j=1; j<=4; ++j) {
     draw((0+(1+t)*i,j)--(1+(1+t)*i,j));
  }
}
 
real s=8;

fill((s,-t)--(5+s,-t)--(5+s,2-t)--(s,2-t)--cycle,myorange);
fill((s,t+2)--(5+s,t+2)--(5+s,5+t)--(s,5+t)--cycle,myblue);
draw((s,-t)--(5+s,-t)--(5+s,2-t)--(s,2-t)--cycle);
draw((s,t+2)--(5+s,t+2)--(5+s,5+t)--(s,5+t)--cycle);
for (int i=1; i<=4; ++i) {
   draw((s+i,-t)--(s+i,2-t));
   draw((s+i,t+2)--(s+i,t+5));
   if (i<2) {
      draw((s,i-t)--(5+s,i-t));
      }
   else {
      draw((s,i+t)--(5+s,i+t));
      }
   }