#include <stdio.h>

int main(){
    int n;
    scanf("%d",&n);
    int countle=0;
    int countchan=0;
    while(n>0){
    if((n%10)%2!=0){
        countle++;
    }
    else
    countchan++;
    n/=10;
}
if(countle==0){
printf("0 ");printf("%d",countchan);
}
else if(countchan==0){
printf("%d ",countle);printf("0");
}
else if(countchan!=0&&countle!=0){
printf("%d %d",countle,countchan);
}

}