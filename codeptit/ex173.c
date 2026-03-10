#include <stdio.h>
#include <string.h>
#include <stdbool.h>
bool check(int n){
  int rev=0,log=n;
while(n>0){
    if(n%10==9)return 0;
    rev=rev*10+n%10;
    n/=10;
}
if(rev==log){
    return 1;
}
else return 0;
}
int main(){
    int a;scanf("%d",&a);
    int tong=0;
    for(int i=2;i<=a;i++){
        if(check(i)){
            printf("%d ",i);
            tong++;
        }
    }
    printf("\n");
    printf("%d",tong);
}