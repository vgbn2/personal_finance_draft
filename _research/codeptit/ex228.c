#include <stdio.h>
#include <math.h>
int main(){
    int a,b,c,d,e,f;scanf("%d%d%d%d%d%d",&a,&b,&c,&d,&e,&f);
    int s=a*b+d*c+e*f;
    long long r=(long long)sqrt(s);
    if(r*r==s)
    printf("YES\n");
    else
    printf("NO\n");
  
}