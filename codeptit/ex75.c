#include <stdio.h>
int check(int s){
   int o=s,rev=0;
   while(s>0){
       rev=rev*10+s%10;
    s/=10;
   }
   if(rev!=o)return 0;
   return 1;
}
int main(){
   int s1,s2;scanf("%d%d",&s1,&s2);
if(check(s1)==check(s2))printf("NO\n");
else printf("YES\n");
}