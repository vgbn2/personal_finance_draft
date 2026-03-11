#include <stdio.h>

int main(){
    int t;
    scanf("%d",&t);
    while(t--){
        int countle=0;
        int countchan=0;
       int n;
        scanf("%d",&n);
    while(n>0){
        int digit=n%10;
    if((digit%2)!=0){
        countle++;
    }
    else{
    countchan++;
    }
    n/=10;
}
printf("%d %d\n",countle,countchan);
}
}